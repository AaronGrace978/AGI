// ═══════════════════════════════════════════════════════════════
//  PIE Bench Suite
//  Deterministic evaluation tasks for PIE search quality.
// ═══════════════════════════════════════════════════════════════

import type { Grid, TrainingPair } from '../types';

export interface PIEBenchTask {
  id: string;
  name: string;
  trainingPairs: TrainingPair[];
  testInput: Grid;
  expectedTestOutput: Grid;
}

// NOTE: This suite is intentionally small and high-signal.
// Expand over time as you collect real ARC tasks.
export const PIE_BENCH_SUITE: PIEBenchTask[] = [
  {
    id: 'arc-row-anchors-noise',
    name: 'Row fill with column-stable anchors (noise overwrite)',
    trainingPairs: [
      {
        input: [
          [0, 2, 0, 0, 3],
          [0, 2, 0, 0, 3],
          [0, 2, 0, 0, 3],
        ],
        output: [
          [2, 2, 2, 3, 3],
          [2, 2, 2, 3, 3],
          [2, 2, 2, 3, 3],
        ],
      },
      {
        input: [
          [4, 0, 0, 5, 0],
          [4, 0, 0, 5, 0],
          [4, 0, 0, 5, 0],
        ],
        output: [
          [4, 4, 4, 5, 5],
          [4, 4, 4, 5, 5],
          [4, 4, 4, 5, 5],
        ],
      },
      {
        input: [
          [0, 7, 0, 8, 0],
          [0, 7, 9, 8, 0],
          [0, 7, 0, 8, 0],
        ],
        output: [
          [7, 7, 7, 8, 8],
          [7, 7, 7, 8, 8],
          [7, 7, 7, 8, 8],
        ],
      },
    ],
    testInput: [
      [0, 6, 0, 0, 1],
      [0, 6, 2, 0, 1],
      [0, 6, 0, 0, 1],
    ],
    expectedTestOutput: [
      [6, 6, 6, 1, 1],
      [6, 6, 6, 1, 1],
      [6, 6, 6, 1, 1],
    ],
  },
  {
    id: 'arc-killer-bottom-anchors',
    name: 'Killer: bottom anchors + broadcast',
    trainingPairs: [
      {
        input: [
          [0, 2, 0, 0],
          [3, 0, 0, 4],
          [0, 0, 0, 0],
        ],
        output: [
          [3, 2, 4, 4],
          [3, 2, 4, 4],
          [3, 2, 4, 4],
        ],
      },
      {
        input: [
          [0, 5, 0, 6],
          [0, 0, 0, 0],
          [7, 0, 0, 8],
        ],
        output: [
          [7, 5, 8, 8],
          [7, 5, 8, 8],
          [7, 5, 8, 8],
        ],
      },
      {
        input: [
          [0, 1, 9, 0],
          [2, 0, 0, 3],
          [0, 0, 0, 0],
        ],
        output: [
          [2, 1, 3, 3],
          [2, 1, 3, 3],
          [2, 1, 3, 3],
        ],
      },
    ],
    testInput: [
      [0, 4, 0, 0],
      [6, 0, 2, 0],
      [0, 0, 0, 0],
    ],
    expectedTestOutput: [
      [6, 4, 2, 2],
      [6, 4, 2, 2],
      [6, 4, 2, 2],
    ],
  },
];
