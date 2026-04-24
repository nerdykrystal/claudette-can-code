// Targeted coverage for plan-generator error-return branches.
// Lines 155-163 (SCHEMA_INVALID) and 168-176 (SKILL_GAP) are unreachable from
// the generator's own code path under a correct schema + empty skillInvocations.
// vi.mock on the schema module and skill-gap module forces both branches.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Bundle, BundleDoc } from '../../src/core/bundle/index.js';
import type { YourSetupCatalog } from '../../src/core/catalog/index.js';

// Build a minimal bundle fixture that produces a valid plan under normal conditions.
function makeBundle(): Bundle {
  const doc = (kind: BundleDoc['kind']): BundleDoc => ({
    kind,
    path: `/fake/${kind}.md`,
    content: `# ${kind}\ncontent`,
    frontmatter: { status: 'APPROVED' },
  });
  return {
    prd: doc('PRD'),
    trd: doc('TRD'),
    avd: doc('AVD'),
    tqcd: doc('TQCD'),
  };
}

function makeCatalog(): YourSetupCatalog {
  return {
    skills: [],
    plugins: [],
    mcpServers: [],
    source: { settingsPath: '/fake/settings.json', pluginsDir: '/fake/plugins' },
  };
}

describe('Plan Generator — error-return branches (lines 155-163, 168-176)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../src/core/types/schemas.js');
    vi.doUnmock('../../src/core/skill-gap/index.js');
    vi.resetModules();
  });

  it('lines 155-163: returns SCHEMA_INVALID when plan fails schema validation', async () => {
    // Mock the schema module to return a schema that rejects everything
    // (requires a property that the real plan does not have).
    vi.doMock('../../src/core/types/schemas.js', () => ({
      planSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: ['__deliberately_absent__'],
        properties: {
          __deliberately_absent__: { type: 'string' },
        },
      },
      auditEntrySchema: {},
      deviationManifestSchema: {},
      convergenceGateResultSchema: {},
      inputManifestSchema: {},
    }));

    const { generate } = await import('../../src/core/plan-generator/index.js');
    const result = await generate({ bundle: makeBundle(), catalog: makeCatalog() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
      expect(result.error.detail).toContain('Plan failed schema validation');
      // Validator errors must be embedded so operator can remediate.
      expect(result.error.detail).toMatch(/__deliberately_absent__/);
    }
  });

  it('lines 168-176: returns SKILL_GAP when skill-gap check reports missing skills', async () => {
    // Mock skill-gap checker to always return a gap, simulating a plan that
    // references a skill absent from the YourSetupCatalog.
    vi.doMock('../../src/core/skill-gap/index.js', () => ({
      check: () => ({
        ok: false,
        error: [{ stageId: 'impl-0', missingSkill: '/imaginary-skill' }],
      }),
    }));

    const { generate } = await import('../../src/core/plan-generator/index.js');
    const result = await generate({ bundle: makeBundle(), catalog: makeCatalog() });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SKILL_GAP');
      expect(result.error.detail).toContain('Skill gaps detected');
      expect(result.error.gaps).toEqual([
        { stageId: 'impl-0', missingSkill: '/imaginary-skill' },
      ]);
    }
  });
});
