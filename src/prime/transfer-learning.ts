export interface TransferHeuristic {
  id: string;
  statement: string;
  confidence: number;
  sourceCount: number;
  evidenceScore: number;
  proven: boolean;
}

const PATTERNS: Array<{ regex: RegExp; template: string; boost: number }> = [
  {
    regex: /\b(verify|validation|assert|check)\b/i,
    template: 'Before finalizing an action, add an explicit verification step.',
    boost: 0.12,
  },
  {
    regex: /\b(fallback|rollback|recover|retry)\b/i,
    template: 'Plan rollback or fallback paths before high-impact execution.',
    boost: 0.14,
  },
  {
    regex: /\b(decompose|break down|phase|milestone)\b/i,
    template: 'Decompose complex goals into phased milestones with dependency order.',
    boost: 0.1,
  },
  {
    regex: /\b(risk|unsafe|danger|harm)\b/i,
    template: 'Run risk screening before autonomous high-privilege actions.',
    boost: 0.15,
  },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function deriveTransferHeuristicsFromProceduralMemories(proceduralMemories: string[]): TransferHeuristic[] {
  if (proceduralMemories.length === 0) return [];

  const aggregate = new Map<string, { hits: number; boost: number }>();
  for (const memory of proceduralMemories) {
    for (const pattern of PATTERNS) {
      if (!pattern.regex.test(memory)) continue;
      const prev = aggregate.get(pattern.template) ?? { hits: 0, boost: 0 };
      aggregate.set(pattern.template, {
        hits: prev.hits + 1,
        boost: prev.boost + pattern.boost,
      });
    }
  }

  return [...aggregate.entries()]
    .map(([statement, meta], idx) => {
      const density = meta.hits / Math.max(1, proceduralMemories.length);
      const confidence = clamp01(0.35 + density * 0.45 + meta.boost * 0.2);
      const evidenceScore = clamp01(density * 0.65 + Math.min(1, meta.hits / 4) * 0.35);
      const proven = meta.hits >= 2 && confidence >= 0.6;
      return {
        id: `xfer_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        statement,
        confidence,
        sourceCount: meta.hits,
        evidenceScore,
        proven,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
}
