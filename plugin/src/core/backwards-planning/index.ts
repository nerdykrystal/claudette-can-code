export interface ExcellenceSpec {
  excellentEndState: string;
  qaCriteria: string[];
  constraints: string[];
}

export interface PlannedStage {
  id: string;
  name: string;
  purpose: string;
  dependsOn: string[];
}

export function planBackwards(spec: ExcellenceSpec): PlannedStage[] {
  // Deterministic stage generation from excellence spec
  const stages: PlannedStage[] = [];

  // 1. QA stage (depends on all implementation stages)
  const qaStage: PlannedStage = {
    id: 'qa',
    name: 'Quality Assurance',
    purpose: 'Convergence gate across all stages',
    dependsOn: [],
  };

  // 2. Implementation stages (one per QA criterion)
  const implStages: PlannedStage[] = [];
  for (let i = 0; i < spec.qaCriteria.length; i++) {
    implStages.push({
      id: `impl-${i}`,
      name: `Implementation Stage ${i}`,
      purpose: spec.qaCriteria[i],
      dependsOn: ['scaffold'],
    });
  }

  // QA depends on all impl stages
  qaStage.dependsOn = implStages.map((s) => s.id);

  // 3. Scaffold stage (foundation)
  const scaffoldStage: PlannedStage = {
    id: 'scaffold',
    name: 'Project Scaffold',
    purpose: 'Directory structure and configuration',
    dependsOn: ['plan-full'],
  };

  // 4. Planning stages
  const planSkeletonStage: PlannedStage = {
    id: 'plan-skeleton',
    name: 'Plan Skeleton',
    purpose: 'Initial plan outline',
    dependsOn: [],
  };

  const planFullStage: PlannedStage = {
    id: 'plan-full',
    name: 'Full Plan Content',
    purpose: 'Detailed plan with all specifications',
    dependsOn: ['plan-skeleton'],
  };

  // Reverse dependency order: scaffold before impl, impl before qa
  stages.push(planSkeletonStage);
  stages.push(planFullStage);
  stages.push(scaffoldStage);
  stages.push(...implStages);
  stages.push(qaStage);

  return stages;
}
