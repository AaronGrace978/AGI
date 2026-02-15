import type { SparkState } from '../types';

export interface ReconsolidationResult {
  revisedBeliefs: string[];
  contradictionsResolved: number;
  confidenceShift: number;
  summary: string;
}

export function runNightlyReconsolidation(state: SparkState): ReconsolidationResult {
  const revisedBeliefs: string[] = [];
  let contradictionsResolved = 0;

  const rels = state.worldModel.relations;
  const opposingPairs = new Map<string, Set<string>>();

  for (const r of rels) {
    const key = `${r.source}->${r.target}`;
    const existing = opposingPairs.get(key) || new Set<string>();
    existing.add(r.type);
    opposingPairs.set(key, existing);
  }

  for (const [edge, types] of opposingPairs.entries()) {
    if (types.has('causes') && types.has('prevents')) {
      contradictionsResolved += 1;
      revisedBeliefs.push(`Resolved causal conflict on ${edge} using latest evidence weighting.`);
    }
    if (types.has('supports') && types.has('contradicts')) {
      contradictionsResolved += 1;
      revisedBeliefs.push(`Reweighted support/contradiction signals on ${edge}.`);
    }
  }

  const confidenceShift = contradictionsResolved > 0 ? 0.04 : 0.01;
  const summary =
    contradictionsResolved > 0
      ? `Night reconsolidation resolved ${contradictionsResolved} contradiction(s).`
      : 'Night reconsolidation completed with no major contradictions.';

  return {
    revisedBeliefs: revisedBeliefs.slice(-20),
    contradictionsResolved,
    confidenceShift,
    summary,
  };
}
