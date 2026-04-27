// Type declarations for modules without bundled @types packages.
// Stage 06 — proper-lockfile + write-file-atomic.

declare module 'proper-lockfile' {
  interface LockOptions {
    retries?: number | { retries: number; minTimeout?: number; maxTimeout?: number };
    stale?: number;
    update?: number;
    realpath?: boolean;
    lockfilePath?: string;
    onCompromised?: (err: Error) => void;
  }

  interface UnlockOptions {
    realpath?: boolean;
    lockfilePath?: string;
  }

  type ReleaseFunction = () => Promise<void>;

  function lock(file: string, options?: LockOptions): Promise<ReleaseFunction>;
  function unlock(file: string, options?: UnlockOptions): Promise<void>;
  function lockSync(file: string, options?: Omit<LockOptions, 'retries'>): () => void;
  function unlockSync(file: string, options?: UnlockOptions): void;
  function check(file: string, options?: LockOptions): Promise<boolean>;
  function checkSync(file: string, options?: LockOptions): boolean;

  export { lock, unlock, lockSync, unlockSync, check, checkSync };
  export default lock;
}

declare module 'write-file-atomic' {
  interface WriteFileAtomicOptions {
    encoding?: BufferEncoding | null;
    mode?: number;
    chown?: { uid: number; gid: number };
    tmpfileCreated?: (tmpfile: string) => void;
  }

  function writeFileAtomic(
    filename: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileAtomicOptions | BufferEncoding | null,
  ): Promise<void>;

  namespace writeFileAtomic {
    function sync(
      filename: string,
      data: string | Buffer | Uint8Array,
      options?: WriteFileAtomicOptions | BufferEncoding | null,
    ): void;
  }

  export = writeFileAtomic;
}
