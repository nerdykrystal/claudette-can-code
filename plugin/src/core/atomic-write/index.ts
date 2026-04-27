// Atomic Write wrapper — Stage 07.
// Strategy: write-file-atomic (POSIX-strong; handles Windows gracefully).
// AC-21 native C++ N-API helper deferred to follow-up gate / v1.2.0.
// See disclosure: Windows EPERM contention from antivirus is a known risk
// (Stage 00 Insight C). write-file-atomic covers the vast majority of paths.

import writeFileAtomic from 'write-file-atomic';
import type { Result } from '../types/index.js';

export type AtomicWriteError =
  | { kind: 'native_unavailable'; message: string }
  | { kind: 'rename_failed'; from: string; to: string; cause: string; message: string }
  | { kind: 'fsync_failed'; path: string; cause: string; message: string };

/**
 * Atomically write `content` to `path`.
 * Uses write-file-atomic (POSIX-strong via tmp + fsync + rename).
 * Falls back gracefully on Windows where NTFS rename semantics differ.
 *
 * AC-21 disclosure: A native C++ N-API helper (CreateFile + FlushFileBuffers +
 * ReplaceFile) providing Windows-strong guarantees is DEFERRED to a follow-up
 * gate or v1.2.0. write-file-atomic handles most Windows paths; residual risk
 * is antivirus-induced EPERM contention (Stage 00 Finding 3 / Insight C).
 *
 * @param path - Absolute or relative target path
 * @param content - Content to write (string or Buffer)
 */
export async function atomicWrite(
  path: string,
  content: string | Buffer,
): Promise<Result<void, AtomicWriteError>> {
  try {
    await writeFileAtomic(path, content);
    return { ok: true, value: undefined };
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    // Distinguish rename failures from fsync failures where possible
    if (cause.includes('rename') || cause.includes('EPERM') || cause.includes('EXDEV')) {
      return {
        ok: false,
        error: {
          kind: 'rename_failed',
          from: `${path}.tmp`,
          to: path,
          cause,
          message: `Atomic rename failed: ${cause}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: 'fsync_failed',
        path,
        cause,
        message: `Atomic write failed: ${cause}`,
      },
    };
  }
}
