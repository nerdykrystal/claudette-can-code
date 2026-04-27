// Unit tests for execFileNoThrow utility — Stage 12.

import { describe, it, expect } from 'vitest';
import { execFileNoThrow } from '../../../src/utils/execFileNoThrow.js';

describe('execFileNoThrow()', () => {
  it('returns ok=true for successful command', async () => {
    // Use node --version as a cross-platform safe command
    const result = await execFileNoThrow('node', ['--version']);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^v\d+\.\d+/);
  });

  it('returns ok=false for non-existent command', async () => {
    const result = await execFileNoThrow('cdcc-nonexistent-cmd-12345', []);
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
  });

  it('returns ok=false for command that exits with non-zero', async () => {
    // node -e 'process.exit(42)' exits with code 42
    const result = await execFileNoThrow('node', ['-e', 'process.exit(42)']);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(42);
  });

  it('captures stdout from successful command', async () => {
    const result = await execFileNoThrow('node', ['-e', 'process.stdout.write("hello")']);
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('hello');
  });

  it('captures stderr from failed command', async () => {
    const result = await execFileNoThrow('node', ['-e', 'process.stderr.write("err"); process.exit(1)']);
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('err');
  });

  it('accepts cwd option without error', async () => {
    const result = await execFileNoThrow('node', ['--version'], { cwd: process.cwd() });
    expect(result.ok).toBe(true);
  });
});
