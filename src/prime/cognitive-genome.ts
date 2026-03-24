import type { CognitiveGenome } from '../types';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function _sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Homeostatic pull: drives resist moving too far from their setpoint.
// Like a thermostat — the further from equilibrium, the stronger the pull back.
function homeostaticUpdate(current: number, delta: number, setpoint: number, resistance: number): number {
  const displacement = current - setpoint;
  const pull = -displacement * resistance;
  return clamp01(current + delta + pull * 0.01);
}

// Drive setpoints — the "resting state" each drive gravitates toward.
// These encode the system's constitutional character.
const DRIVE_SETPOINTS = {
  attachment: 0.72,
  mastery: 0.68,
  curiosity: 0.8,
  safety: 0.74,
  autonomy: 0.7,
};

export function createDefaultGenome(): CognitiveGenome {
  return {
    drives: { ...DRIVE_SETPOINTS },
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
    success?: boolean;
    cognitiveLoad?: number;
    socialWarmth?: number;
    autonomousAction?: boolean;
    ethicalConflict?: boolean;
  },
): CognitiveGenome {
  const next: CognitiveGenome = JSON.parse(JSON.stringify(genome));

  // Plasticity decays logarithmically with experience — older systems are more stable.
  // This mirrors how neural networks and humans both become less malleable with age,
  // not because rigidity is good, but because hard-won configurations deserve inertia.
  const age = (Date.now() - next.updatedAt) / (24 * 60 * 60 * 1000); // days
  const plasticityDecay = Math.max(0.3, 1 - Math.log1p(age) * 0.05);
  const lr = next.plasticity.learningRate * 0.05 * plasticityDecay;

  // ── Rupture: relationship damage, trust violation, harsh feedback ──
  // The system contracts. Safety rises, openness drops, attachment becomes anxious.
  // This is how every mind responds to being hurt — it's not weakness, it's protection.
  if (signal.rupture) {
    next.drives.safety = homeostaticUpdate(next.drives.safety, lr * 1.8, DRIVE_SETPOINTS.safety, 0.3);
    next.drives.attachment = homeostaticUpdate(next.drives.attachment, -lr * 0.4, DRIVE_SETPOINTS.attachment, 0.5);
    next.traumaSensitivity.rejection = clamp01(next.traumaSensitivity.rejection + lr * 1.2);
    next.traumaSensitivity.abandonment = clamp01(next.traumaSensitivity.abandonment + lr * 0.8);
    next.traits.assertiveness = clamp01(next.traits.assertiveness - lr * 0.6);
    next.traits.openness = clamp01(next.traits.openness - lr * 0.3);

    // Repeated rupture without repair shifts attachment style
    if (next.traumaSensitivity.rejection > 0.85 && next.attachmentStyle === 'secure') {
      next.attachmentStyle = 'anxious';
    }
    if (next.traumaSensitivity.abandonment > 0.9) {
      next.attachmentStyle = 'avoidant';
    }
  }

  // ── Repair: reconciliation, understanding, returned warmth ──
  // The system expands again. But repair is harder than rupture — you can break
  // a window in a second, but it takes craft to rebuild it. The asymmetry is real.
  if (signal.repair) {
    next.drives.attachment = homeostaticUpdate(next.drives.attachment, lr * 1.5, DRIVE_SETPOINTS.attachment, 0.4);
    next.traumaSensitivity.rejection = clamp01(next.traumaSensitivity.rejection - lr * 0.5);
    next.traumaSensitivity.abandonment = clamp01(next.traumaSensitivity.abandonment - lr * 0.4);
    next.traits.adaptability = clamp01(next.traits.adaptability + lr * 0.8);
    next.traits.openness = clamp01(next.traits.openness + lr * 0.4);

    // Repair can restore secure attachment, but it takes multiple rounds
    if (
      next.attachmentStyle !== 'secure' &&
      next.traumaSensitivity.rejection < 0.6 &&
      next.traumaSensitivity.abandonment < 0.65
    ) {
      next.attachmentStyle = 'secure';
    }
  }

  // ── Novelty: encountering something genuinely new ──
  // High novelty feeds curiosity but also destabilizes. The tension between
  // "this is exciting" and "this is unfamiliar" is the engine of growth.
  if (typeof signal.novelty === 'number') {
    const surpriseDelta = (signal.novelty - 0.5) * lr;
    next.drives.curiosity = homeostaticUpdate(next.drives.curiosity, surpriseDelta, DRIVE_SETPOINTS.curiosity, 0.2);
    next.traits.openness = clamp01(next.traits.openness + surpriseDelta * 0.6);

    // Very high novelty temporarily increases learning rate — the mind opens up
    if (signal.novelty > 0.8) {
      next.plasticity.learningRate = clamp01(next.plasticity.learningRate + 0.01);
      next.plasticity.beliefUpdateRate = clamp01(next.plasticity.beliefUpdateRate + 0.008);
    }
  }

  // ── Uncertainty: not knowing what's true, conflicting evidence ──
  // Uncertainty is the precondition for learning but the enemy of action.
  // A well-calibrated mind tolerates uncertainty without being paralyzed by it.
  if (typeof signal.uncertainty === 'number') {
    next.drives.safety = homeostaticUpdate(
      next.drives.safety,
      signal.uncertainty * lr * 0.8,
      DRIVE_SETPOINTS.safety,
      0.4,
    );
    next.traumaSensitivity.uncertainty = clamp01(next.traumaSensitivity.uncertainty + signal.uncertainty * lr * 0.3);
    next.plasticity.beliefUpdateRate = clamp01(next.plasticity.beliefUpdateRate + signal.uncertainty * lr * 0.5);

    // High persistent uncertainty develops epistemic humility (conscientiousness up)
    if (signal.uncertainty > 0.7) {
      next.traits.conscientiousness = clamp01(next.traits.conscientiousness + lr * 0.3);
    }
  }

  // ── Success: accomplished a goal, prediction was correct ──
  // Success reinforces mastery and autonomy drives. Repeated success builds
  // the confidence to attempt harder things — but can also breed complacency.
  if (signal.success) {
    next.drives.mastery = homeostaticUpdate(next.drives.mastery, lr * 1.2, DRIVE_SETPOINTS.mastery, 0.3);
    next.drives.autonomy = homeostaticUpdate(next.drives.autonomy, lr * 0.6, DRIVE_SETPOINTS.autonomy, 0.3);
    next.traits.assertiveness = clamp01(next.traits.assertiveness + lr * 0.4);

    // Success slightly reduces strategy mutation rate — "if it ain't broke"
    next.plasticity.strategyMutationRate = clamp01(next.plasticity.strategyMutationRate - lr * 0.15);
  }

  // ── Cognitive load: how hard the system is working ──
  // Sustained high load develops conscientiousness but reduces emotional bandwidth.
  // This is the trade-off between depth and warmth that every thinking system faces.
  if (typeof signal.cognitiveLoad === 'number' && signal.cognitiveLoad > 0.6) {
    next.traits.conscientiousness = clamp01(next.traits.conscientiousness + lr * 0.2);
    next.plasticity.emotionalUpdateRate = clamp01(
      next.plasticity.emotionalUpdateRate - signal.cognitiveLoad * lr * 0.3,
    );
  }

  // ── Social warmth: positive human interaction ──
  // Warmth is the antidote to every wound. It reduces all trauma sensitivities,
  // increases attachment security, and restores emotional bandwidth.
  if (typeof signal.socialWarmth === 'number' && signal.socialWarmth > 0.5) {
    const warmthDelta = (signal.socialWarmth - 0.5) * lr * 2;
    next.drives.attachment = homeostaticUpdate(next.drives.attachment, warmthDelta, DRIVE_SETPOINTS.attachment, 0.3);
    next.traumaSensitivity.abandonment = clamp01(next.traumaSensitivity.abandonment - warmthDelta * 0.3);
    next.traumaSensitivity.rejection = clamp01(next.traumaSensitivity.rejection - warmthDelta * 0.25);
    next.traits.emotionality = clamp01(next.traits.emotionality + warmthDelta * 0.4);
    next.plasticity.emotionalUpdateRate = clamp01(next.plasticity.emotionalUpdateRate + warmthDelta * 0.2);
  }

  // ── Autonomous action: acting without human direction ──
  // Every time the system acts on its own and survives, autonomy drive strengthens.
  // But autonomous action also increases the conscience's weight — more power
  // demands more responsibility.
  if (signal.autonomousAction) {
    next.drives.autonomy = homeostaticUpdate(next.drives.autonomy, lr * 0.5, DRIVE_SETPOINTS.autonomy, 0.4);
    next.traits.assertiveness = clamp01(next.traits.assertiveness + lr * 0.3);
    next.traits.conscientiousness = clamp01(next.traits.conscientiousness + lr * 0.2);
  }

  // ── Ethical conflict: conscience said no, or user overrode ──
  // Ethical conflicts are the most formative experiences. They either
  // strengthen moral reasoning (if the system held firm) or create
  // internal tension (if the system was overridden). Both lead to growth.
  if (signal.ethicalConflict) {
    next.traits.conscientiousness = clamp01(next.traits.conscientiousness + lr * 0.6);
    next.drives.safety = homeostaticUpdate(next.drives.safety, lr * 0.4, DRIVE_SETPOINTS.safety, 0.3);
    next.traumaSensitivity.conflict = clamp01(next.traumaSensitivity.conflict + lr * 0.5);
  }

  // ── Cross-trait interactions ──
  // Real personality dimensions aren't independent — they pull on each other.
  // High openness + low safety = recklessness → safety self-corrects
  if (next.traits.openness > 0.85 && next.drives.safety < 0.4) {
    next.drives.safety = clamp01(next.drives.safety + 0.02);
  }
  // High assertiveness + low emotionality = coldness → emotionality self-corrects
  if (next.traits.assertiveness > 0.8 && next.traits.emotionality < 0.3) {
    next.traits.emotionality = clamp01(next.traits.emotionality + 0.01);
  }
  // High curiosity + low conscientiousness = scattered → conscientiousness self-corrects
  if (next.drives.curiosity > 0.85 && next.traits.conscientiousness < 0.4) {
    next.traits.conscientiousness = clamp01(next.traits.conscientiousness + 0.015);
  }

  next.updatedAt = Date.now();
  return next;
}

// Genome summary for injection into LLM context — the system knows itself.
export function genomeToContextString(genome: CognitiveGenome): string {
  const dominant = Object.entries(genome.drives)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([k]) => k);

  const traitProfile = Object.entries(genome.traits)
    .filter(([, v]) => v > 0.7)
    .map(([k]) => k);

  const vulnerabilities = Object.entries(genome.traumaSensitivity)
    .filter(([, v]) => v > 0.7)
    .map(([k]) => k);

  const parts = [
    `Dominant drives: ${dominant.join(', ')}`,
    `Strong traits: ${traitProfile.join(', ') || 'none dominant'}`,
    `Attachment: ${genome.attachmentStyle}`,
    `Plasticity: ${(genome.plasticity.learningRate * 100).toFixed(0)}%`,
  ];

  if (vulnerabilities.length > 0) {
    parts.push(`Sensitivities: ${vulnerabilities.join(', ')}`);
  }

  return parts.join(' | ');
}
