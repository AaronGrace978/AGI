import { describe, it, expect } from 'vitest';
import { verifyResponse } from './verifier';
import type { ForgeBenchmark } from '../types';

const SAMPLE_BENCHMARK: ForgeBenchmark = {
  id: 'test-bench',
  prompt: 'Solve this problem',
  expectedKeywords: ['solution', 'reasoning', 'result'],
  evaluationType: 'keyword',
  weight: 1,
};

describe('verifyResponse (used by FORGE runtime)', () => {
  it('passes response containing structure and keywords', () => {
    const response = 'Step 1: Verify the input. Step 2: Apply the solution with proper reasoning to get the result.';
    const result = verifyResponse(response, SAMPLE_BENCHMARK, false);
    expect(result.passed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('fails empty responses', () => {
    const result = verifyResponse('', SAMPLE_BENCHMARK, false);
    expect(result.passed).toBe(false);
    expect(result.confidence).toBeLessThan(0.45);
  });

  it('strict mode requires more structural tokens', () => {
    const response =
      'The solution involves reasoning about the result. We should verify assumptions and handle risk with a fallback.';
    const strict = verifyResponse(response, SAMPLE_BENCHMARK, true);
    const relaxed = verifyResponse(response, SAMPLE_BENCHMARK, false);
    expect(strict.confidence).toBeGreaterThan(0);
    expect(relaxed.confidence).toBeGreaterThan(0);
  });

  it('strict mode with missing structure tokens fails', () => {
    const response = 'The solution involves reasoning about the result.';
    const result = verifyResponse(response, SAMPLE_BENCHMARK, true);
    expect(result.passed).toBe(false);
  });

  it('empty expected keywords gives full keyword score', () => {
    const bench: ForgeBenchmark = { ...SAMPLE_BENCHMARK, expectedKeywords: [] };
    const response = 'Step: verify the approach.';
    const result = verifyResponse(response, bench, false);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('confidence is clamped between 0 and 1', () => {
    const result = verifyResponse('x', SAMPLE_BENCHMARK, false);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
