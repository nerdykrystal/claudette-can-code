import { defineConfig } from 'vitest/config';
import { spawnSync } from 'node:child_process';

// Ensure build is up-to-date before running e2e tests
const buildResult = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    reporters: ['default', 'junit'],
  },
});
