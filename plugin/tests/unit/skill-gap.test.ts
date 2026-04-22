import { describe, it, expect } from 'vitest';
import { check } from '../../src/core/skill-gap/index.js';
import type { Plan, GateSpec } from '../../src/core/types/index.js';
import type { YourSetupCatalog } from '../../src/core/catalog/index.js';

const createMockPlan = (stages: Array<{ id: string; skillInvocations: string[] }>): Plan => ({
  schemaVersion: '0.1.0',
  id: 'test-plan',
  createdAt: '2026-04-22T00:00:00Z',
  bundle: { prdPath: '/prd', trdPath: '/trd', avdPath: '/avd', tqcdPath: '/tqcd' },
  stages: stages.map((s) => ({
    id: s.id,
    name: `Stage ${s.id}`,
    assignedModel: 'haiku-4-5',
    effortLevel: 'medium',
    specDepth: 'Deep',
    gate: { threshold: 3, severityPolicy: 'standard', domain: 'code' } as GateSpec,
    inputManifest: [],
    skillInvocations: s.skillInvocations,
  })),
});

const createMockCatalog = (skills: string[], plugins: string[], mcps: string[]): YourSetupCatalog => ({
  skills,
  plugins,
  mcpServers: mcps,
  source: { settingsPath: '/path/to/settings.json', pluginsDir: '/path/to/plugins' },
});

describe('Skill-Gap Checker (FR-018)', () => {
  it('no gaps: all skills present', () => {
    const plan = createMockPlan([{ id: 'stage1', skillInvocations: ['skill1', 'plugin1'] }]);
    const catalog = createMockCatalog(['skill1', 'skill2'], ['plugin1'], []);

    const result = check(plan, catalog);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('one stage missing skill', () => {
    const plan = createMockPlan([{ id: 'stage1', skillInvocations: ['skill1', 'missing-skill'] }]);
    const catalog = createMockCatalog(['skill1'], [], []);

    const result = check(plan, catalog);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0].stageId).toBe('stage1');
      expect(result.error[0].missingSkill).toBe('missing-skill');
    }
  });

  it('multiple gaps across stages', () => {
    const plan = createMockPlan([
      { id: 'stage1', skillInvocations: ['skill1', 'missing1'] },
      { id: 'stage2', skillInvocations: ['skill2', 'missing2', 'missing3'] },
    ]);
    const catalog = createMockCatalog(['skill1', 'skill2'], [], []);

    const result = check(plan, catalog);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBe(3);
      expect(result.error.some((g) => g.stageId === 'stage1' && g.missingSkill === 'missing1')).toBe(true);
      expect(result.error.some((g) => g.stageId === 'stage2' && g.missingSkill === 'missing2')).toBe(true);
      expect(result.error.some((g) => g.stageId === 'stage2' && g.missingSkill === 'missing3')).toBe(true);
    }
  });

  it('empty plan is trivially ok', () => {
    const plan: Plan = {
      schemaVersion: '0.1.0',
      id: 'empty-plan',
      createdAt: '2026-04-22T00:00:00Z',
      bundle: { prdPath: '/prd', trdPath: '/trd', avdPath: '/avd', tqcdPath: '/tqcd' },
      stages: [],
    };
    const catalog = createMockCatalog([], [], []);

    const result = check(plan, catalog);

    expect(result.ok).toBe(true);
  });

  it('checks across skills, plugins, and mcpServers', () => {
    const plan = createMockPlan([
      { id: 'stage1', skillInvocations: ['skill1', 'plugin1', 'mcp1'] },
    ]);
    const catalog = createMockCatalog(['skill1'], ['plugin1'], ['mcp1']);

    const result = check(plan, catalog);

    expect(result.ok).toBe(true);
  });

  it('missing skill found even if present in plugins or mcps', () => {
    const plan = createMockPlan([{ id: 'stage1', skillInvocations: ['missing-skill'] }]);
    const catalog = createMockCatalog(['skill1'], ['plugin1'], ['mcp1']);

    const result = check(plan, catalog);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBe(1);
      expect(result.error[0].missingSkill).toBe('missing-skill');
    }
  });
});
