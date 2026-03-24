import { describe, it, expect } from 'vitest';
import { detectARCTask, runPIE } from './pie';

describe('detectARCTask (UI formats)', () => {
  it('parses Input/Output blocks without colons and solves via PIE', () => {
    const msg = [
      'ARC Task: “Object Reflection by Color”',
      '',
      'Training Example 1',
      '',
      'Input',
      '',
      '0 0 0 0 0 0',
      '0 2 2 0 0 0',
      '0 2 0 0 3 3',
      '0 0 0 0 3 0',
      '0 0 0 0 0 0',
      '',
      'Output',
      '',
      '0 0 0 0 0 0',
      '0 2 2 0 2 2',
      '0 2 0 0 3 3',
      '0 0 0 0 3 0',
      '0 0 0 0 0 0',
      '',
      'Training Example 2',
      '',
      'Input',
      '',
      '0 0 0 0 0 0 0',
      '0 4 4 0 0 5 0',
      '0 4 0 0 5 5 0',
      '0 0 0 0 0 0 0',
      '',
      'Output',
      '',
      '0 0 0 0 0 0 0',
      '0 4 4 0 4 4 0',
      '0 4 0 0 5 5 0',
      '0 0 0 0 0 0 0',
      '',
      'Training Example 3',
      '',
      'Input',
      '',
      '0 0 0 0 0',
      '0 7 7 0 0',
      '0 7 0 0 8',
      '0 0 0 0 8',
      '0 0 0 0 0',
      '',
      'Output',
      '',
      '0 0 0 0 0',
      '0 7 7 0 7',
      '0 7 0 0 8',
      '0 0 0 0 8',
      '0 0 0 0 0',
      '',
      'Test Input (Your AGI must solve this)',
      '0 0 0 0 0 0 0',
      '0 6 6 0 0 9 0',
      '0 6 0 0 0 9 9',
      '0 0 0 0 0 0 0',
    ].join('\n');

    const detected = detectARCTask(msg);
    expect(detected).not.toBeNull();
    expect(detected!.trainingPairs.length).toBe(3);
    expect(detected!.testInput).not.toBeNull();

    const pie = runPIE(detected!.trainingPairs, detected!.testInput ?? undefined);
    expect(pie.lockedProgram).not.toBeNull();
    expect(pie.testOutput).not.toBeNull();

    expect(pie.testOutput).toEqual([
      [0, 0, 0, 0, 0, 0, 0],
      [0, 6, 6, 0, 6, 6, 0],
      [0, 6, 0, 0, 0, 9, 9],
      [0, 0, 0, 0, 0, 0, 0],
    ]);
  });
});
