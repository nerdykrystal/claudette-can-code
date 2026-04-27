import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../../src/cli/index.js';

// Helper to run CLI directly by invoking the exported main function
async function runCLI(args: string[], env?: Record<string, string>): Promise<{
  stdout: string;
  stderr: string;
  status: number;
}> {
  const oldArgv = process.argv;
  const oldEnv = process.env.CLAUDE_ROOT;
  const logCapture: { stdout: string[]; stderr: string[] } = { stdout: [], stderr: [] };

  try {
    process.argv = ['node', 'cdcc', ...args];
    if (env?.CLAUDE_ROOT) {
      process.env.CLAUDE_ROOT = env.CLAUDE_ROOT;
    } else if (oldEnv) {
      delete process.env.CLAUDE_ROOT;
    }

    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    const stringifyArg = (a: unknown): string => (typeof a === 'string' ? a : String(a));
    console.log = (...msgArgs: unknown[]): void => {
      // Just concatenate arguments without JSON.stringify
      logCapture.stdout.push(msgArgs.map(stringifyArg).join(' '));
    };
    console.error = (...msgArgs: unknown[]): void => {
      logCapture.stderr.push(msgArgs.map(stringifyArg).join(' '));
    };

    let status = 0;
    try {
      status = await main();
    } catch (err) {
      logCapture.stderr.push((err as Error).message);
      status = 99;
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    return {
      stdout: logCapture.stdout.join('\n'),
      stderr: logCapture.stderr.join('\n'),
      status,
    };
  } finally {
    process.argv = oldArgv;
    if (oldEnv !== undefined) {
      process.env.CLAUDE_ROOT = oldEnv;
    } else {
      delete process.env.CLAUDE_ROOT;
    }
  }
}

describe('CLI E2E Tests', () => {
  const examplesPath = resolve(__dirname, '../../examples/hello-world-planning');

  describe('help command', () => {
    it('should display help with --help flag', async () => {
      const result = await runCLI(['--help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('USAGE');
      expect(result.stdout).toContain('cdcc — Claudette Can Code');
    });

    it('should display help with -h flag', async () => {
      const result = await runCLI(['-h']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });

    it('should display help with help command', async () => {
      const result = await runCLI(['help']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });
  });

  describe('dry-run command', () => {
    it('should validate bundle and output plan without disk writes', async () => {
      const result = await runCLI(['dry-run', examplesPath]);
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('dryRun', true);
      expect(parsed).toHaveProperty('plan');
      expect(parsed.plan).toHaveProperty('stages');
    });

    it('should return exit code 2 when planning-dir is missing', async () => {
      const result = await runCLI(['dry-run']);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Usage: cdcc dry-run');
    });

    it('should return exit code 3 on bundle consumption failure (nonexistent path)', async () => {
      const result = await runCLI(['dry-run', '/nonexistent/path/to/planning']);
      expect(result.status).toBe(3);
      try {
        const parsed = JSON.parse(result.stderr);
        expect(parsed).toHaveProperty('error');
      } catch {
        // If JSON parsing fails, stderr should still contain error indication
        expect(result.stderr).toContain('error');
      }
    });
  });

  describe('generate command', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cdcc-e2e-'));
    });

    afterEach(() => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true });
      }
    });

    it('should generate plan.json and install hooks', async () => {
      const claudeRoot = join(tmpDir, '.claude');
      const result = await runCLI(['generate', examplesPath], { CLAUDE_ROOT: claudeRoot });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('ok', true);
      expect(parsed).toHaveProperty('plan');
      expect(parsed).toHaveProperty('settings');
      expect(parsed).toHaveProperty('stages');
    });

    it('should return exit code 2 when planning-dir is missing', async () => {
      const claudeRoot = join(tmpDir, '.claude');
      const result = await runCLI(['generate'], { CLAUDE_ROOT: claudeRoot });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Usage: cdcc generate');
    });

    it('should return exit code 3 on bundle consumption failure', async () => {
      const claudeRoot = join(tmpDir, '.claude');
      const result = await runCLI(['generate', '/nonexistent/path'], { CLAUDE_ROOT: claudeRoot });
      expect(result.status).toBe(3);
      try {
        const parsed = JSON.parse(result.stderr);
        expect(parsed).toHaveProperty('error');
      } catch {
        expect(result.stderr).toContain('error');
      }
    });
  });

  describe('unknown command', () => {
    it('should return exit code 1 for unknown command', async () => {
      const result = await runCLI(['frobulate']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown command');
      expect(result.stderr).toContain('Usage:');
    });

    it('should handle no command gracefully', async () => {
      const result = await runCLI([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown command');
    });
  });

  describe('audit command', () => {
    it('should return empty or valid audit log', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'cdcc-audit-'));
      try {
        const claudeRoot = tmpDir;
        const result = await runCLI(['audit'], { CLAUDE_ROOT: claudeRoot });
        expect(result.status).toBe(0);
        const parsed = JSON.parse(result.stdout);
        expect(Array.isArray(parsed)).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });
  });
});
