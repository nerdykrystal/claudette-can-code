import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(__dirname, '../../../schemas');

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(schemasDir, name), 'utf-8')) as Record<string, unknown>;
}

export const planSchema = load('plan.schema.json');
export const auditEntrySchema = load('audit-entry.schema.json');
export const deviationManifestSchema = load('deviation-manifest.schema.json');
export const convergenceGateResultSchema = load('convergence-gate-result.schema.json');
export const inputManifestSchema = load('input-manifest.schema.json');
