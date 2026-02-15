import type { CognitiveGenome } from '../types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function createDefaultGenome(): CognitiveGenome {
  return {
    drives: {
      attachment: 0.72,
      mastery: 0.68,
      curiosity: 0.8,
      safety: 0.74,
      autonomy: 0.7,
    },
    traits: {
      openness: 0.78,
      conscientiousness: 0.7,
      emotionality: 0.66,
      assertiveness: 0.58,
      adaptability: 0.74,
    },
    plasticity: {
      learningRate: 0.62,
      beliefUpdateRate: 0.58,
      strategyMutationRate: 0.42,
      emotionalUpdateRate: 0.6,
    },
    traumaSensitivity: {
      abandonment: 0.76,
      rejection: 0.71,
      uncertainty: 0.64,
      conflict: 0.55,
    },
    attachmentStyle: 'secure',
    updatedAt: Date.now(),
  };
}

export function adaptGenomeFromSignal(
  genome: CognitiveGenome,
  signal: {
    rupture?: boolean;
    repair?: boolean;
    novelty?: number;
    uncertainty?: number;
  },
): CognitiveGenome {
  const next: CognitiveGenome = JSON.parse(JSON.stringify(genome));
  const lr = next.plasticity.learningRate * 0.05;

  if (signal.rupture) {
    next.drives.safety = clamp01(next.drives.safety + lr * 1.5);
    next.traumaSensitivity.rejection = clamp01(next.traumaSensitivity.rejection + lr);
    next.traits.assertiveness = clamp01(next.traits.assertiveness - lr * 0.6);
  }
  if (signal.repair) {
    next.drives.attachment = clamp01(next.drives.attachment + lr * 1.2);
    next.traumaSensitivity.rejection = clamp01(next.traumaSensitivity.rejection - lr * 0.7);
    next.traits.adaptability = clamp01(next.traits.adaptability + lr * 0.7);
  }
  if (typeof signal.novelty === 'number') {
    next.drives.curiosity = clamp01(next.drives.curiosity + (signal.novelty - 0.5) * lr);
    next.traits.openness = clamp01(next.traits.openness + (signal.novelty - 0.5) * lr * 0.6);
  }
  if (typeof signal.uncertainty === 'number') {
    next.drives.safety = clamp01(next.drives.safety + signal.uncertainty * lr * 0.8);
    next.plasticity.beliefUpdateRate = clamp01(
      next.plasticity.beliefUpdateRate + signal.uncertainty * lr * 0.4,
    );
  }

  next.updatedAt = Date.now();
  return next;
}
