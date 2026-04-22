/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: [
    'src/core/gate/**/*.ts',
    'src/core/backwards-planning/**/*.ts',
    'src/hooks/**/*.ts',
    'src/core/skill-gap/**/*.ts',
    'src/core/sub-agent-redirector/**/*.ts',
  ],
  thresholds: {
    high: 90,
    low: 80,
    break: 80,
  },
};
