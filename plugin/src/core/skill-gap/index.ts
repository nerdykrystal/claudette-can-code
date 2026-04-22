import { Result, Plan } from '../types/index.js';
import type { YourSetupCatalog } from '../catalog/index.js';

export interface SkillGap {
  stageId: string;
  missingSkill: string;
}

export function check(plan: Plan, catalog: YourSetupCatalog): Result<void, SkillGap[]> {
  const gaps: SkillGap[] = [];

  // Build available set of skills
  const available = new Set<string>();
  catalog.skills.forEach((s) => available.add(s));
  catalog.plugins.forEach((p) => available.add(p));
  catalog.mcpServers.forEach((m) => available.add(m));

  // Check each stage
  for (const stage of plan.stages) {
    for (const skillInvocation of stage.skillInvocations) {
      if (!available.has(skillInvocation)) {
        gaps.push({
          stageId: stage.id,
          missingSkill: skillInvocation,
        });
      }
    }
  }

  if (gaps.length > 0) {
    return { ok: false, error: gaps };
  }

  return { ok: true, value: undefined };
}
