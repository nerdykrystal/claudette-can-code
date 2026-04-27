// resolver.ts — ProtectedFilesResolver
// Stage 09 — FR-007 Protected Files Resolver.
//
// precompile(yamlPath): load + parse + Ajv-validate + pre-compile globs at SessionStart.
// match(targetPath, currentPersona): per-PreToolUse sync match. Fast: compiled glob list.
//
// Windows case-insensitive path matching: normalize both sides to lowercase before matching.
// YAML parsing: yaml (v2.8.3, added Stage 09).
//
// First-match precedence: rules evaluated in order; first matching rule wins.

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { validateProtectedFilesYaml } from './yaml-schema.js';
import type { ProtectedFilesConfig, ProtectedFilesRule } from './yaml-schema.js';
import type { Result } from '../types/index.js';

export type MatchResult =
  | { allowed: true }
  | { allowed: false; ruleId: string; denyMessage: string; allowedPersonas: string[] };

export type ResolverError =
  | { kind: 'read_error'; message: string; cause?: unknown }
  | { kind: 'parse_error'; message: string; cause?: unknown }
  | { kind: 'schema_error'; message: string; errors: unknown[] }
  | { kind: 'not_loaded'; message: string };

export interface ProtectedFilesResolver {
  precompile(yamlPath: string): Result<void, ResolverError>;
  match(targetPath: string, currentPersona: string): MatchResult;
}

/**
 * Platform-aware path normalization for glob matching.
 * Normalizes backslashes to forward slashes and lowercases for Windows
 * case-insensitive matching.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

/**
 * Convert a glob pattern string to a regex string.
 * Supports: doublestar (matches any path including slashes),
 * singlestar (matches any non-slash characters), questionmark, character classes.
 * Used for in-memory matching without filesystem access.
 */
function globToRegex(glob: string): string {
  let result = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      // doublestar: matches any path including slashes
      result += '.*';
      i += 2;
      // skip trailing slash after doublestar
      if (glob[i] === '/') i++;
    } else if (c === '*') {
      // singlestar: matches any non-slash characters
      result += '[^/]*';
      i++;
    } else if (c === '?') {
      result += '[^/]';
      i++;
    } else if (c === '[') {
      // character class: pass through
      const end = glob.indexOf(']', i);
      if (end === -1) {
        result += '\\[';
        i++;
      } else {
        result += glob.slice(i, end + 1);
        i = end + 1;
      }
    } else if ('.+^${}()|\\'.includes(c)) {
      result += '\\' + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }
  // Anchor: the pattern must match the end of the path or a path segment boundary
  return '(^|/)' + result + '(/|$)';
}

/**
 * Pure glob matching without filesystem access.
 * Converts glob pattern to regex, tests against normalized path.
 * Case-insensitive matching (Windows compatible).
 */
export function matchGlobPattern(normalizedPath: string, glob: string): boolean {
  const regexStr = globToRegex(normalizePath(glob));
  const re = new RegExp(regexStr, 'i');
  return re.test(normalizedPath);
}

/**
 * Compiled rule: pre-processed for fast matching.
 */
interface CompiledRule {
  id: string;
  glob: string;
  allowedPersonas: string[];
  denyMessage: string;
}

/**
 * ProtectedFilesResolver implementation.
 * Module-scoped state: loaded at SessionStart via precompile(); used sync per PreToolUse.
 */
export class ProtectedFilesResolverImpl implements ProtectedFilesResolver {
  private compiledRules: CompiledRule[] | null = null;

  precompile(yamlPath: string): Result<void, ResolverError> {
    // Step 1: read file
    let raw: string;
    try {
      raw = readFileSync(yamlPath, 'utf-8');
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: 'read_error',
          message: `Cannot read protected_files.yaml at ${yamlPath}: ${err instanceof Error ? err.message : String(err)}`,
          cause: err,
        },
      };
    }

    // Step 2: parse YAML
    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: 'parse_error',
          message: `YAML parse error in ${yamlPath}: ${err instanceof Error ? err.message : String(err)}`,
          cause: err,
        },
      };
    }

    // Step 3: validate schema
    const valid = validateProtectedFilesYaml(parsed);
    if (!valid) {
      return {
        ok: false,
        error: {
          kind: 'schema_error',
          message: 'protected_files.yaml schema validation failed',
          errors: validateProtectedFilesYaml.errors ?? [],
        },
      };
    }

    // Step 4: compile rules into memory cache
    const config = parsed as ProtectedFilesConfig;
    this.compiledRules = config.rules.map(
      (r: ProtectedFilesRule): CompiledRule => ({
        id: r.id,
        glob: r.glob,
        allowedPersonas: r.allowed_personas,
        denyMessage: r.deny_message,
      }),
    );

    return { ok: true, value: undefined };
  }

  match(targetPath: string, currentPersona: string): MatchResult {
    // Fail-closed: if not loaded, block all
    if (this.compiledRules === null) {
      return {
        allowed: false,
        ruleId: 'h8_not_loaded',
        denyMessage: 'Protected files resolver not loaded — call precompile() at SessionStart',
        allowedPersonas: [],
      };
    }

    const normalizedTarget = normalizePath(targetPath);

    // First-match precedence
    for (const rule of this.compiledRules) {
      if (matchGlobPattern(normalizedTarget, rule.glob)) {
        const normalizedPersona = currentPersona.toLowerCase();
        const allowed = rule.allowedPersonas.some(
          (p) => p.toLowerCase() === normalizedPersona,
        );
        if (allowed) {
          return { allowed: true };
        }
        return {
          allowed: false,
          ruleId: rule.id,
          denyMessage: rule.denyMessage,
          allowedPersonas: rule.allowedPersonas,
        };
      }
    }

    // No rule matched: allow by default
    return { allowed: true };
  }
}

/** Module-scoped singleton resolver for hook use. */
export const resolver = new ProtectedFilesResolverImpl();
