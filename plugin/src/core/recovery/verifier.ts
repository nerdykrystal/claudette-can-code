// Recovery Verifier — Stage 10. A21 canonical. UNFLAGGED per gate-49.
// runVerification: typecheck + lint + coverage + scope-vs-role-manifest checks.
// Detection + audit-emission only. Does NOT do git revert. Does NOT spawn Agent.
//
// Pinned import per §3.10: execSync from node:child_process.
// All subprocess calls use hardcoded literal command strings — no user input interpolated.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecoveryEvent } from './recovery-events-schema.js';

export interface VerificationOptions {
  typecheck?: boolean;
  lint?: boolean;
  coverage?: boolean;
  scopeBoundsCheck?: boolean;
  /** Overrides cwd for subprocess execution (defaults to process.cwd()) */
  cwd?: string;
  /** Path to role-manifest YAML for scope check (optional; skipped if not provided) */
  roleManifestPath?: string;
}

export interface Violation {
  type: RecoveryEvent['violation_type'];
  description: string;
  suggestedRevertTarget: string;
}

export interface VerificationResult {
  passed: boolean;
  violations: Violation[];
}

/** Run a shell command with hardcoded literal args; return { ok, stdout, stderr }. Never throws. */
function runCmd(
  cmd: string,
  cwd: string,
): { ok: boolean; stdout: string; stderr: string } {
  try {
    // All calls use fully-literal cmd strings — no user input interpolated.
    const stdout = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout ?? '', stderr: '' };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(err),
    };
  }
}

/** Get the current HEAD commit hash (7-char short) for revert_target. */
function getHeadHash(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'working_tree_state';
  }
}

/** Check if this is a git workspace. */
function isGitWorkspace(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/** Check typecheck and push violation if failed. */
function checkTypecheck(cwd: string, headHash: string, violations: Violation[]): void {
  const result = runCmd('npx tsc --noEmit', cwd);
  if (!result.ok) {
    violations.push({
      type: 'coverage_drop',
      description: `TypeScript typecheck failed:\n${result.stderr || result.stdout}`,
      suggestedRevertTarget: headHash,
    });
  }
}

/** Check lint and push violation if failed. */
function checkLint(cwd: string, headHash: string, violations: Violation[]): void {
  const result = runCmd('npx eslint src/ --max-warnings 0 --format compact', cwd);
  if (!result.ok) {
    violations.push({
      type: 'scope_violation',
      description: `ESLint errors detected:\n${result.stderr || result.stdout}`,
      suggestedRevertTarget: headHash,
    });
  }
}

/** Check coverage (vitest run) and push violation if failed. */
function checkCoverage(stageId: string, cwd: string, headHash: string, violations: Violation[]): void {
  const result = runCmd('npx vitest run --reporter=basic', cwd);
  if (!result.ok) {
    const output = result.stderr + result.stdout;
    const isCoverageDrop =
      output.includes('Coverage threshold') ||
      output.includes('coverage') ||
      output.includes('Threshold');
    violations.push({
      type: isCoverageDrop ? 'coverage_drop' : 'false_attestation',
      description: `Test/coverage failure for stage ${stageId}:\n${output.slice(0, 1000)}`,
      suggestedRevertTarget: headHash,
    });
  }
}

/** Check role-manifest scope bounds and push violation if out of scope. */
function checkScopeBounds(
  stageId: string,
  roleManifestPath: string,
  headHash: string,
  violations: Violation[],
): void {
  const manifestFullPath = resolve(roleManifestPath);
  if (!existsSync(manifestFullPath)) {
    violations.push({
      type: 'role_boundary',
      description: `Role manifest not found at ${manifestFullPath}. Cannot verify scope bounds.`,
      suggestedRevertTarget: headHash,
    });
    return;
  }
  try {
    const manifest = readFileSync(manifestFullPath, 'utf-8');
    if (manifest.includes('allowed_stages') && !manifest.includes(stageId)) {
      violations.push({
        type: 'role_boundary',
        description: `Stage ${stageId} is not in the allowed_stages list in role manifest ${manifestFullPath}`,
        suggestedRevertTarget: headHash,
      });
    }
  } catch (err) {
    violations.push({
      type: 'role_boundary',
      description: `Failed to read role manifest at ${manifestFullPath}: ${String(err)}`,
      suggestedRevertTarget: headHash,
    });
  }
}

/**
 * Run the Stage 10 verification suite.
 * Checks: typecheck, lint, coverage, scope-vs-role-manifest.
 * Returns VerificationResult — passed:true when no violations found.
 *
 * H9 calls this on every Stop event. Detection only. Parent assistant
 * handles any revert + redelegation per Q7-lock + CCC empirical pattern.
 */
export function runVerification(
  stageId: string,
  opts: VerificationOptions = {},
): VerificationResult {
  const {
    typecheck = true,
    lint = true,
    coverage = true,
    scopeBoundsCheck = true,
    cwd = process.cwd(),
    roleManifestPath,
  } = opts;

  const violations: Violation[] = [];
  const resolvedCwd = resolve(cwd);

  // Guard: non-git workspace — cannot provide revert_target hex; surface role_boundary
  if (!isGitWorkspace(resolvedCwd)) {
    violations.push({
      type: 'role_boundary',
      description: `Non-git workspace at ${resolvedCwd}: recovery revert not possible. Set up git before running H9.`,
      suggestedRevertTarget: 'working_tree_state',
    });
    return { passed: false, violations };
  }

  const headHash = getHeadHash(resolvedCwd);

  if (typecheck) checkTypecheck(resolvedCwd, headHash, violations);
  if (lint) checkLint(resolvedCwd, headHash, violations);
  if (coverage) checkCoverage(stageId, resolvedCwd, headHash, violations);
  if (scopeBoundsCheck && roleManifestPath) {
    checkScopeBounds(stageId, roleManifestPath, headHash, violations);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
