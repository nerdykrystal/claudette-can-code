// execFileNoThrow — Stage 12 utility.
// Safe subprocess wrapper using execFile (not exec) to prevent shell injection.
// Handles Windows compatibility. Returns structured output with stdout/stderr/status.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
  ok: boolean;
}

/**
 * Run a command with args using execFile (no shell interpolation).
 * Never throws — returns structured result with ok=false on failure.
 */
export async function execFileNoThrow(
  cmd: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: options.cwd,
      windowsHide: true,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString(), status: 0, ok: true };
  } catch (err) {
    const anyErr = err as NodeJS.ErrnoException & { stdout?: Buffer | string; stderr?: Buffer | string; code?: number | string };
    const stdout = anyErr.stdout ? String(anyErr.stdout) : '';
    const stderr = anyErr.stderr ? String(anyErr.stderr) : String(err);
    const status = typeof anyErr.code === 'number' ? anyErr.code : 1;
    return { stdout, stderr, status, ok: false };
  }
}
