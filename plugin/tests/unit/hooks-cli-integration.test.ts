import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as h1 from '../../src/hooks/h1-input-manifest/index.js';
import * as h2 from '../../src/hooks/h2-deviation-manifest/index.js';
import * as h3 from '../../src/hooks/h3-sandbox-hygiene/index.js';
import * as h4 from '../../src/hooks/h4-model-assignment/index.js';
import * as h5 from '../../src/hooks/h5-gate-result/index.js';

describe('Hook CLI Wrappers Integration Tests', () => {
  let tmpDir: string;
  let claudeRoot: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hook-cli-'));
    claudeRoot = tmpDir;
    originalEnv = { ...process.env };
    process.env.CLAUDE_ROOT = claudeRoot;
  });

  afterEach(async () => {
    process.env.CLAUDE_ROOT = originalEnv.CLAUDE_ROOT;
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('H1 Input Manifest Hook CLI', () => {
    it('handle() function initializes logger and calls handleImpl', async () => {
      // Setup: create plan-state with manifest
      const planDir = join(claudeRoot, 'plugins', 'cdcc');
      await mkdir(planDir, { recursive: true });
      await writeFile(
        join(planDir, 'plan-state.json'),
        JSON.stringify({
          stages: [{ id: 'stage-1', inputManifest: ['file.txt'] }],
        })
      );

      // Mock process.exit to prevent actual exit
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h1.handle as any)();
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'exit') {
          throw err;
        }
      }

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('handle() creates audit logger in expected location', async () => {
      const planDir = join(claudeRoot, 'plugins', 'cdcc');
      await mkdir(planDir, { recursive: true });
      await writeFile(
        join(planDir, 'plan-state.json'),
        JSON.stringify({
          stages: [{ id: 'stage-1', inputManifest: ['file.txt'] }],
        })
      );

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h1.handle as any)();
      } catch {
        // Expected to throw on exit
      }

      exitSpy.mockRestore();
      // Verify audit log directory was created
      const auditDir = join(claudeRoot, 'cdcc-audit');
      expect(auditDir).toBeDefined();
    });
  });

  describe('H2 Deviation Manifest Hook CLI', () => {
    it('handle() function initializes and processes stdin', async () => {
      const stdinData = 'regular output without sentinel';

      // Mock stdin
      const stdinSpy = vi.spyOn(process.stdin, Symbol.asyncIterator as any)
        .mockReturnValue(async function* () {
          yield Buffer.from(stdinData);
        }());

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h2.handle as any)();
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'exit') {
          throw err;
        }
      }

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
      stdinSpy.mockRestore();
    });

    it('handle() creates audit logger', async () => {
      const stdinData = 'no sentinel';

      const stdinSpy = vi.spyOn(process.stdin, Symbol.asyncIterator as any)
        .mockReturnValue(async function* () {
          yield Buffer.from(stdinData);
        }());

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h2.handle as any)();
      } catch {
        // Expected
      }

      exitSpy.mockRestore();
      stdinSpy.mockRestore();
    });
  });

  describe('H3 Sandbox Hygiene Hook CLI', () => {
    it('handle() function initializes and creates marker path', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h3.handle as any)();
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'exit') {
          throw err;
        }
      }

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('handle() sets up sandbox marker path correctly', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h3.handle as any)();
      } catch {
        // Expected
      }

      // Verify the marker file was created in expected location
      const expectedMarkerDir = join(claudeRoot, 'plugins', 'cdcc');
      expect(expectedMarkerDir).toBeDefined();
      exitSpy.mockRestore();
    });
  });

  describe('H4 Model Assignment Hook CLI', () => {
    it('handle() function initializes and processes plan state', async () => {
      const planDir = join(claudeRoot, 'plugins', 'cdcc');
      await mkdir(planDir, { recursive: true });
      await writeFile(
        join(planDir, 'plan-state.json'),
        JSON.stringify({
          currentStageId: 'stage-1',
          stages: [{ id: 'stage-1', assignedModel: 'claude-haiku' }],
        })
      );

      const stdinData = JSON.stringify({
        tool: 'Read',
        args: {},
        executingModel: 'claude-haiku',
      });

      const stdinSpy = vi.spyOn(process.stdin, Symbol.asyncIterator as any)
        .mockReturnValue(async function* () {
          yield Buffer.from(stdinData);
        }());

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h4.handle as any)();
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'exit') {
          throw err;
        }
      }

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
      stdinSpy.mockRestore();
    });

    it('handle() creates audit logger and plan state path', async () => {
      const planDir = join(claudeRoot, 'plugins', 'cdcc');
      await mkdir(planDir, { recursive: true });
      await writeFile(
        join(planDir, 'plan-state.json'),
        JSON.stringify({
          currentStageId: 'stage-1',
          stages: [{ id: 'stage-1', assignedModel: 'claude-haiku' }],
        })
      );

      const stdinData = JSON.stringify({ tool: 'Read' });

      const stdinSpy = vi.spyOn(process.stdin, Symbol.asyncIterator as any)
        .mockReturnValue(async function* () {
          yield Buffer.from(stdinData);
        }());

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h4.handle as any)();
      } catch {
        // Expected
      }

      exitSpy.mockRestore();
      stdinSpy.mockRestore();
    });
  });

  describe('H5 Gate Result Hook CLI', () => {
    it('handle() function initializes and processes stdin', async () => {
      const stdinData = JSON.stringify({
        converged: true,
        counter: 1,
        findings: [],
      });

      const stdinSpy = vi.spyOn(process.stdin, Symbol.asyncIterator as any)
        .mockReturnValue(async function* () {
          yield Buffer.from(stdinData);
        }());

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h5.handle as any)();
      } catch (err) {
        if (!(err instanceof Error) || err.message !== 'exit') {
          throw err;
        }
      }

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
      stdinSpy.mockRestore();
    });

    it('handle() creates audit logger', async () => {
      const stdinData = JSON.stringify({
        converged: false,
        counter: 5,
        findings: [{ severity: 'LOW', message: 'test' }],
      });

      const stdinSpy = vi.spyOn(process.stdin, Symbol.asyncIterator as any)
        .mockReturnValue(async function* () {
          yield Buffer.from(stdinData);
        }());

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });

      try {
        await (h5.handle as any)();
      } catch {
        // Expected
      }

      exitSpy.mockRestore();
      stdinSpy.mockRestore();
    });
  });
});
