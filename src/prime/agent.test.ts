import { describe, it, expect } from 'vitest';
import {
  createDefaultCognitiveState,
  buildWorkingMemoryContext,
  createKernelActionEnvelope,
  parseThinkResponse,
  parseReflectResponse,
  COGNITIVE_SYSTEM_PROMPT,
  THINK_PROMPT,
  REFLECT_PROMPT,
  type CognitiveStep,
} from './agent';

describe('createDefaultCognitiveState', () => {
  it('returns idle state', () => {
    const state = createDefaultCognitiveState();
    expect(state.isActive).toBe(false);
    expect(state.phase).toBe('idle');
    expect(state.iteration).toBe(0);
    expect(state.maxIterations).toBe(25);
    expect(state.steps).toHaveLength(0);
    expect(state.workingMemory).toHaveLength(0);
    expect(state.startedAt).toBeNull();
  });
});

describe('buildWorkingMemoryContext', () => {
  it('includes goal and iteration', () => {
    const ctx = buildWorkingMemoryContext('Find the bug', [], [], 3);
    expect(ctx).toContain('GOAL: Find the bug');
    expect(ctx).toContain('ITERATION: 3');
  });

  it('includes working memory entries', () => {
    const ctx = buildWorkingMemoryContext('goal', [], ['file.ts has error', 'tried restarting'], 1);
    expect(ctx).toContain('WORKING MEMORY');
    expect(ctx).toContain('file.ts has error');
    expect(ctx).toContain('tried restarting');
  });

  it('includes recent steps with types', () => {
    const steps: CognitiveStep[] = [
      { type: 'think', content: 'I should read the file', timestamp: Date.now() },
      {
        type: 'act',
        content: '',
        timestamp: Date.now(),
        actionType: 'read_file',
        actionResult: { success: true, output: 'file contents here' },
      },
      { type: 'reflect', content: 'The file had useful info', timestamp: Date.now() },
    ];
    const ctx = buildWorkingMemoryContext('goal', steps, [], 2);
    expect(ctx).toContain('[THINK]');
    expect(ctx).toContain('[ACT:read_file] OK');
    expect(ctx).toContain('[REFLECT]');
  });

  it('caps recent steps to 6', () => {
    const steps: CognitiveStep[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'think' as const,
      content: `step ${i}`,
      timestamp: Date.now(),
    }));
    const ctx = buildWorkingMemoryContext('goal', steps, [], 10);
    expect(ctx).toContain('step 9');
    expect(ctx).not.toContain('step 0');
  });
});

describe('createKernelActionEnvelope', () => {
  it('creates well-formed envelope', () => {
    const env = createKernelActionEnvelope('read_file', { path: '/tmp/test' }, 'test-agent');
    expect(env.type).toBe('read_file');
    expect(env.payload).toEqual({ path: '/tmp/test' });
    expect(env.source).toBe('test-agent');
    expect(env.id).toMatch(/^kernel_action_/);
  });

  it('defaults source to cognitive-agent', () => {
    const env = createKernelActionEnvelope('list_directory', {});
    expect(env.source).toBe('cognitive-agent');
  });
});

describe('parseThinkResponse', () => {
  it('parses valid JSON', () => {
    const raw = `{"thought": "Let me read the file", "action": "read_file", "params": {"path": "test.txt"}, "goalProgress": 0.3, "shouldStop": false}`;
    const result = parseThinkResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.thought).toBe('Let me read the file');
    expect(result!.action).toBe('read_file');
    expect(result!.params).toEqual({ path: 'test.txt' });
    expect(result!.goalProgress).toBe(0.3);
    expect(result!.shouldStop).toBe(false);
  });

  it('extracts JSON from surrounding text', () => {
    const raw = `Here's my thinking: {"thought": "test", "action": "ls", "params": {}, "goalProgress": 1, "shouldStop": true} done`;
    const result = parseThinkResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.shouldStop).toBe(true);
  });

  it('returns null for non-JSON', () => {
    expect(parseThinkResponse('no json here')).toBeNull();
  });

  it('handles missing fields with defaults', () => {
    const result = parseThinkResponse('{}');
    expect(result).not.toBeNull();
    expect(result!.thought).toBe('');
    expect(result!.action).toBe('');
    expect(result!.goalProgress).toBe(0);
    expect(result!.shouldStop).toBe(false);
  });
});

describe('parseReflectResponse', () => {
  it('parses valid reflection JSON', () => {
    const raw = `{"reflection": "It worked", "lessonLearned": "Check first", "progressAssessment": "closer", "nextStrategy": "continue"}`;
    const result = parseReflectResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.reflection).toBe('It worked');
    expect(result!.progressAssessment).toBe('closer');
  });

  it('returns null for garbage', () => {
    expect(parseReflectResponse('not json')).toBeNull();
  });

  it('defaults progressAssessment to same', () => {
    const result = parseReflectResponse('{"reflection": "hmm"}');
    expect(result).not.toBeNull();
    expect(result!.progressAssessment).toBe('same');
  });
});

describe('prompt constants', () => {
  it('COGNITIVE_SYSTEM_PROMPT is non-empty', () => {
    expect(COGNITIVE_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('THINK_PROMPT includes JSON format', () => {
    expect(THINK_PROMPT).toContain('goalProgress');
    expect(THINK_PROMPT).toContain('shouldStop');
  });

  it('REFLECT_PROMPT includes JSON format', () => {
    expect(REFLECT_PROMPT).toContain('reflection');
    expect(REFLECT_PROMPT).toContain('lessonLearned');
  });
});
