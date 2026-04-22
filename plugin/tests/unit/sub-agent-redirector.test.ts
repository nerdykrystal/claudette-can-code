import { describe, it, expect } from 'vitest';
import { redirect, emit, type BlockedToolCall } from '../../src/core/sub-agent-redirector/index.js';

describe('Sub-Agent Redirector', () => {
  it('should produce redirect directive with correct shape', () => {
    const blocked: BlockedToolCall = {
      tool: 'Write',
      args: { path: 'test.md', content: 'test' },
      executingModel: 'haiku-4-5',
      stageId: 'stage-01',
    };

    const directive = redirect(blocked, 'opus-4-7', 'stage-01');

    expect(directive.action).toBe('redirect');
    expect(directive.assignedModel).toBe('opus-4-7');
    expect(directive.stageId).toBe('stage-01');
    expect(directive.originalTool).toBe('Write');
    expect(directive.originalArgs).toEqual(blocked.args);
    expect(directive.rationale).toContain('opus-4-7');
    expect(directive.rationale).toContain('haiku-4-5');
  });

  it('should handle Edit tool', () => {
    const blocked: BlockedToolCall = {
      tool: 'Edit',
      args: { path: 'test.md', oldString: 'old', newString: 'new' },
      executingModel: 'haiku-4-5',
      stageId: 'stage-02',
    };

    const directive = redirect(blocked, 'sonnet-4-6', 'stage-02');

    expect(directive.originalTool).toBe('Edit');
    expect(directive.assignedModel).toBe('sonnet-4-6');
  });

  it('should emit directive as JSON to stdout', () => {
    const blocked: BlockedToolCall = {
      tool: 'Write',
      args: { path: 'test.md' },
      executingModel: 'haiku-4-5',
      stageId: 'stage-01',
    };

    const directive = redirect(blocked, 'opus-4-7', 'stage-01');

    // Capture stdout
    const originalLog = console.log;
    let captured = '';
    console.log = (msg: string) => {
      captured += msg;
    };

    try {
      emit(directive);

      // Parse and validate emitted JSON
      const parsed = JSON.parse(captured);
      expect(parsed.action).toBe('redirect');
      expect(parsed.assignedModel).toBe('opus-4-7');
    } finally {
      console.log = originalLog;
    }
  });

  it('should produce pure directive object (no side effects)', () => {
    const blocked: BlockedToolCall = {
      tool: 'Write',
      args: { original: 'test' },
      executingModel: 'haiku-4-5',
      stageId: 'stage-01',
    };

    const directive1 = redirect(blocked, 'opus-4-7', 'stage-01');
    const directive2 = redirect(blocked, 'opus-4-7', 'stage-01');

    expect(directive1).toEqual(directive2);
  });
});
