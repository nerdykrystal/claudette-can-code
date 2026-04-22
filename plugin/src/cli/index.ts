#!/usr/bin/env node
// CLI entry point for the cdcc plugin. Thin wrapper (excluded from coverage).
// Stage 03: generate, dry-run. Stage 04: audit + hook installer.

import { join } from 'node:path';
import { AuditLogger } from '../core/audit/index.js';

const [, , command, ...args] = process.argv;

async function main(): Promise<void> {
  const claudeRoot = process.env.CLAUDE_ROOT || join(process.env.HOME || '/root', '.claude');

  switch (command) {
    case 'generate':
      console.error('cdcc generate: Stage 03 deliverable — not yet implemented');
      process.exit(1);

    case 'audit': {
      // Parse --since flag
      let since: string | undefined;
      for (const arg of args) {
        if (arg.startsWith('--since=')) {
          since = arg.slice('--since='.length);
        }
      }

      const auditLogger = new AuditLogger(join(claudeRoot, 'cdcc-audit'));
      const entries = await auditLogger.query(since ? { since } : undefined);

      console.log(JSON.stringify(entries, null, 2));
      process.exit(0);
    }

    case 'dry-run':
      console.error('cdcc dry-run: Stage 03 deliverable — not yet implemented');
      process.exit(1);

    default:
      console.error(`cdcc: unknown command "${command ?? '(none)'}".\nUsage: cdcc <generate|audit|dry-run> [args]`);
      process.exit(1);
  }
}

void main();
