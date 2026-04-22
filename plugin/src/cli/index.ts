#!/usr/bin/env node
// CLI entry point for the cdcc plugin. This file is excluded from coverage thresholds (thin wrapper).
// Stage 03/04 (Haiku) will wire the actual command implementations.
// Commands: generate <planning-dir>, audit [--since=<ISO8601>], dry-run <planning-dir>

const [, , command, ...args] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case 'generate':
      console.error('cdcc generate: Stage 03 deliverable — not yet implemented');
      process.exit(1);
    case 'audit':
      console.error('cdcc audit: Stage 04 deliverable — not yet implemented');
      process.exit(1);
    case 'dry-run':
      console.error('cdcc dry-run: Stage 03 deliverable — not yet implemented');
      process.exit(1);
    default:
      console.error(`cdcc: unknown command "${command ?? '(none)'}".\nUsage: cdcc <generate|audit|dry-run> [args]`);
      process.exit(1);
  }
}

void main();
