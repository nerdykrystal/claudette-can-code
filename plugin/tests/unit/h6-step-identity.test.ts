import { describe, it, expect } from 'vitest';
import {
  redactPats,
  normalizeBashCommand,
  sha256Of,
  computeStepIdentity,
  isSupportedTool,
} from '../../src/hooks/h6-step-reexec/step-identity.js';

describe('H6 step-identity', () => {
  describe('redactPats', () => {
    it('redacts ghp_ classic PATs', () => {
      const cmd = 'curl -H "Authorization: token ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII" https://api.github.com/user';
      const redacted = redactPats(cmd);
      expect(redacted).not.toContain('ghp_AAAA');
      expect(redacted).toContain('<REDACTED:GH_PAT>');
    });

    it('redacts github_pat_ fine-grained PATs', () => {
      const cmd = 'curl github_pat_11ABCDEFG_morestuffhere';
      const redacted = redactPats(cmd);
      expect(redacted).toContain('<REDACTED:GH_FINE_PAT>');
    });

    it('redacts gho_ OAuth tokens', () => {
      const cmd = 'echo gho_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII';
      expect(redactPats(cmd)).toContain('<REDACTED:GH_OAUTH>');
    });

    it('redacts ghs_ server tokens', () => {
      const cmd = 'echo ghs_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII';
      expect(redactPats(cmd)).toContain('<REDACTED:GH_SERVER>');
    });

    it('redacts ghu_ user tokens', () => {
      const cmd = 'echo ghu_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII';
      expect(redactPats(cmd)).toContain('<REDACTED:GH_USER>');
    });

    it('redacts Bearer tokens', () => {
      const cmd = 'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig"';
      expect(redactPats(cmd)).toContain('Bearer <REDACTED:BEARER>');
    });

    it('redacts AWS access key id', () => {
      const cmd = 'aws s3 ls --access-key AKIAIOSFODNN7EXAMPLE';
      expect(redactPats(cmd)).toContain('<REDACTED:AWS_KEY_ID>');
    });

    it('leaves non-PAT content unchanged', () => {
      const cmd = 'echo "hello world"';
      expect(redactPats(cmd)).toBe(cmd);
    });

    it('redacts multiple PATs in same string', () => {
      const cmd = 'a ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII b ghp_JJJJKKKKLLLLMMMMNNNNOOOOPPPPQQQQRRRR';
      const out = redactPats(cmd);
      const matches = out.match(/<REDACTED:GH_PAT>/g);
      expect(matches?.length).toBe(2);
    });
  });

  describe('normalizeBashCommand', () => {
    it('strips ISO 8601 datetime', () => {
      expect(normalizeBashCommand('echo 2026-04-26T10:00:00Z')).toContain('<TS>');
    });

    it('strips ISO 8601 date', () => {
      const out = normalizeBashCommand('mkdir backup-2026-04-26');
      expect(out).toContain('<DATE>');
    });

    it('strips epoch-like numeric blobs', () => {
      const out = normalizeBashCommand('cmd 1714122000');
      expect(out).toContain('<EPOCH>');
    });

    it('strips --seed=<n>', () => {
      const out = normalizeBashCommand('train --seed=12345 --other');
      expect(out).toContain('--seed=<SEED>');
    });

    it('strips --seed <n>', () => {
      const out = normalizeBashCommand('train --seed 12345 --other');
      expect(out).toContain('--seed <SEED>');
    });

    it('strips -seed <n>', () => {
      const out = normalizeBashCommand('train -seed 12345 --other');
      expect(out).toContain('-seed <SEED>');
    });

    it('collapses whitespace runs', () => {
      const out = normalizeBashCommand('echo    foo     bar');
      expect(out).toBe('echo foo bar');
    });

    it('redacts PATs before normalizing', () => {
      const out = normalizeBashCommand('curl ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII');
      expect(out).not.toContain('ghp_AAAA');
      expect(out).toContain('<REDACTED:GH_PAT>');
    });

    it('produces stable signature across timestamp variation', () => {
      const a = normalizeBashCommand('cmd --t 2026-04-26T10:00:00Z');
      const b = normalizeBashCommand('cmd --t 2026-04-27T11:11:11Z');
      expect(a).toBe(b);
    });
  });

  describe('sha256Of', () => {
    it('produces sha256: prefix and 64 hex chars', () => {
      const h = sha256Of('hello');
      expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      expect(sha256Of('x')).toBe(sha256Of('x'));
    });

    it('differs for different inputs', () => {
      expect(sha256Of('a')).not.toBe(sha256Of('b'));
    });
  });

  describe('computeStepIdentity', () => {
    it('Write: step_id includes file_path, hash covers content', () => {
      const a = computeStepIdentity('Write', { file_path: 'a.ts', content: 'x' });
      const b = computeStepIdentity('Write', { file_path: 'a.ts', content: 'y' });
      expect(a.step_id).toBe('Write::a.ts');
      expect(b.step_id).toBe('Write::a.ts');
      expect(a.hash_of_inputs).not.toBe(b.hash_of_inputs);
    });

    it('Write: accepts both file_path and filePath', () => {
      const a = computeStepIdentity('Write', { file_path: 'a.ts', content: 'x' });
      const b = computeStepIdentity('Write', { filePath: 'a.ts', content: 'x' });
      expect(a.step_id).toBe(b.step_id);
      expect(a.hash_of_inputs).toBe(b.hash_of_inputs);
    });

    it('Edit: hash includes both old_string and new_string', () => {
      const a = computeStepIdentity('Edit', { file_path: 'a.ts', old_string: 'A', new_string: 'B' });
      const b = computeStepIdentity('Edit', { file_path: 'a.ts', old_string: 'A', new_string: 'C' });
      expect(a.step_id).toBe(b.step_id);
      expect(a.hash_of_inputs).not.toBe(b.hash_of_inputs);
    });

    it('Edit: accepts camelCase variants', () => {
      const a = computeStepIdentity('Edit', { file_path: 'a.ts', old_string: 'A', new_string: 'B' });
      const b = computeStepIdentity('Edit', { filePath: 'a.ts', oldString: 'A', newString: 'B' });
      expect(a.hash_of_inputs).toBe(b.hash_of_inputs);
    });

    it('Bash: step_id is normalized signature', () => {
      const id = computeStepIdentity('Bash', { command: 'echo   hello' });
      expect(id.step_id).toBe('Bash::echo hello');
    });

    it('Bash: PAT-redacted hash hides the secret', () => {
      const id = computeStepIdentity('Bash', {
        command: 'curl ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII',
      });
      // hash is over PAT-redacted form so identical commands with different PATs collide
      const id2 = computeStepIdentity('Bash', {
        command: 'curl ghp_ZZZZBBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII',
      });
      expect(id.hash_of_inputs).toBe(id2.hash_of_inputs);
    });

    it('Bash: timestamp variation produces same step_id', () => {
      const a = computeStepIdentity('Bash', { command: 'cmd --t 2026-04-26T10:00:00Z' });
      const b = computeStepIdentity('Bash', { command: 'cmd --t 2026-04-27T11:11:11Z' });
      expect(a.step_id).toBe(b.step_id);
    });

    it('Bash: missing command coerces to empty', () => {
      const id = computeStepIdentity('Bash', {});
      expect(id.step_id).toBe('Bash::');
    });

    it('Write: missing content coerces to empty string', () => {
      const id = computeStepIdentity('Write', { file_path: 'a.ts' });
      expect(id.hash_of_inputs).toBe(sha256Of(''));
    });

    it('Edit: missing old/new coerce to empty strings', () => {
      const id = computeStepIdentity('Edit', { file_path: 'a.ts' });
      expect(id.hash_of_inputs).toBe(sha256Of(JSON.stringify({ old: '', new: '' })));
    });
  });

  describe('isSupportedTool', () => {
    it('accepts Write, Edit, Bash', () => {
      expect(isSupportedTool('Write')).toBe(true);
      expect(isSupportedTool('Edit')).toBe(true);
      expect(isSupportedTool('Bash')).toBe(true);
    });

    it('rejects read-only tools and undefined', () => {
      expect(isSupportedTool('Read')).toBe(false);
      expect(isSupportedTool('Glob')).toBe(false);
      expect(isSupportedTool('Grep')).toBe(false);
      expect(isSupportedTool(undefined)).toBe(false);
      expect(isSupportedTool('')).toBe(false);
    });
  });
});
