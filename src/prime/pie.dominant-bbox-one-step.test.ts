import { describe, it, expect } from 'vitest';
import { runPIE } from './pie';
import type { TrainingPair, Grid } from '../types';

describe('PIE ARC: dominant bbox one-step right extension', () => {
  it('locks one-step rule from 3 examples', () => {
    const trainingPairs: TrainingPair[] = [
      {
        input: [
          [0, 0, 0, 0, 0, 0],
          [0, 2, 2, 0, 3, 0],
          [0, 2, 0, 0, 3, 3],
          [0, 0, 0, 0, 0, 0],
        ],
        output: [
          [0, 0, 0, 0, 0, 0],
          [0, 2, 2, 2, 3, 0],
          [0, 2, 0, 2, 3, 3],
          [0, 0, 0, 0, 0, 0],
        ],
      },
      {
        input: [
          [0, 0, 0, 0, 0, 0, 0],
          [0, 4, 4, 0, 0, 5, 0],
          [0, 4, 0, 0, 5, 5, 0],
          [0, 0, 0, 0, 0, 0, 0],
        ],
        output: [
          [0, 0, 0, 0, 0, 0, 0],
          [0, 4, 4, 4, 0, 5, 0],
          [0, 4, 0, 4, 5, 5, 0],
          [0, 0, 0, 0, 0, 0, 0],
        ],
      },
      {
        input: [
          [0, 0, 0, 0, 0, 0],
          [0, 7, 7, 0, 0, 8],
          [0, 7, 0, 0, 8, 8],
          [0, 0, 0, 0, 0, 0],
        ],
        output: [
          [0, 0, 0, 0, 0, 0],
          [0, 7, 7, 7, 0, 8],
          [0, 7, 0, 7, 8, 8],
          [0, 0, 0, 0, 0, 0],
        ],
      },
    ];

    const testInput: Grid = [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 6, 6, 0, 0, 9, 0],
      [0, 6, 0, 0, 0, 9, 9],
      [0, 0, 0, 0, 0, 0, 0],
    ];

    const expected: Grid = [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 6, 6, 6, 0, 9, 0],
      // Note: per the training examples, the extension aligns to the dominant object's
      // global right edge (+1), which can "skip" over a row-local gap.
      [0, 6, 0, 6, 0, 9, 9],
      [0, 0, 0, 0, 0, 0, 0],
    ];

    const r = runPIE(trainingPairs, testInput);
    expect(r.lockedProgram).not.toBeNull();
    expect(r.testOutput).toEqual(expected);
  });
});
