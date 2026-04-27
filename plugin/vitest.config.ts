import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/property/**/*.test.ts', 'tests/reliability/**/*.test.ts', 'tests/e2e/cli-bundle-pipeline/**/*.test.ts'],
    exclude: ['tests/e2e/cli.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/types.ts',
        'src/cli/index.ts',
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
    reporters: ['default', 'junit'],
  },
});
