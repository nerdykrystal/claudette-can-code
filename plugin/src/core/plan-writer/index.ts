import { writeFile, open } from 'node:fs/promises';
import { rename } from 'node:fs/promises';
import Ajv from 'ajv';
import { Result } from '../types/index.js';
import { planSchema } from '../types/schemas.js';
import type { Plan } from '../types/index.js';

export interface WriteError { code: 'SCHEMA_INVALID' | 'WRITE_FAIL'; detail: string }

export async function write(plan: Plan, outPath: string): Promise<Result<void, WriteError>> {
  // Validate against schema first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv as any)({ validateFormats: false });
  const validate = ajv.compile(planSchema);

  if (!validate(plan)) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        detail: `Plan failed schema validation: ${JSON.stringify(validate.errors)}`,
      },
    };
  }

  try {
    // Write to temp file
    const tmpPath = `${outPath}.tmp`;
    const jsonContent = JSON.stringify(plan, null, 2);

    await writeFile(tmpPath, jsonContent, 'utf-8');

    // Fsync via file handle
    const handle = await open(tmpPath, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }

    // Atomic rename
    await rename(tmpPath, outPath);

    return { ok: true, value: undefined };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'WRITE_FAIL',
        detail: `Failed to write plan artifact: ${String(e)}`,
      },
    };
  }
}
