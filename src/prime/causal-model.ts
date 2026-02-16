import type { TemporalPrediction, WorldModel, WorldRelation } from '../types';

interface CausalEdge {
  source: string;
  target: string;
  gain: number;
}

function normalizeCausalGain(rel: WorldRelation): number | null {
  if (rel.type === 'causes') return 0.8 * rel.strength;
  if (rel.type === 'enables') return 0.55 * rel.strength;
  if (rel.type === 'contradicts') return -0.7 * rel.strength;
  return null;
}

function buildCausalEdges(model: WorldModel): CausalEdge[] {
  const edges: CausalEdge[] = [];
  for (const rel of model.relations) {
    const gain = normalizeCausalGain(rel);
    if (gain === null) continue;
    edges.push({ source: rel.source, target: rel.target, gain });
  }
  return edges;
}

export function generateCounterfactualPredictions(params: {
  worldModel: WorldModel;
  anchorEntityIds: string[];
  horizonMs?: number;
  maxPredictions?: number;
}): TemporalPrediction[] {
  const { worldModel, anchorEntityIds } = params;
  const horizonMs = params.horizonMs ?? 60 * 60 * 1000;
  const maxPredictions = params.maxPredictions ?? 3;
  const edges = buildCausalEdges(worldModel);
  if (edges.length === 0 || anchorEntityIds.length === 0) return [];

  const impacted = new Map<string, { score: number; basedOn: string[] }>();
  for (const anchorId of anchorEntityIds.slice(0, 4)) {
    const frontier = [{ id: anchorId, signal: 1, depth: 0 }];
    const visited = new Set<string>([anchorId]);
    while (frontier.length > 0) {
      const current = frontier.shift();
      if (!current) break;
      if (current.depth >= 2) continue;

      for (const edge of edges) {
        if (edge.source !== current.id) continue;
        const nextSignal = current.signal * edge.gain;
        const magnitude = Math.abs(nextSignal);
        if (magnitude < 0.08) continue;

        const prev = impacted.get(edge.target);
        const next = {
          score: (prev?.score ?? 0) + nextSignal,
          basedOn: [...(prev?.basedOn ?? []), anchorId],
        };
        impacted.set(edge.target, next);

        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          frontier.push({ id: edge.target, signal: nextSignal, depth: current.depth + 1 });
        }
      }
    }
  }

  const entityById = new Map(worldModel.entities.map((e) => [e.id, e]));
  const sorted = [...impacted.entries()]
    .sort((a, b) => Math.abs(b[1].score) - Math.abs(a[1].score))
    .slice(0, maxPredictions);

  return sorted.map(([targetId, info], idx) => {
    const entity = entityById.get(targetId);
    const direction = info.score >= 0 ? 'increase' : 'decrease';
    const confidence = Math.max(0.25, Math.min(0.92, Math.abs(info.score)));
    return {
      id: `cf_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      prediction: {
        type: 'counterfactual',
        targetEntityId: targetId,
        targetEntity: entity?.name ?? targetId,
        expectedDirection: direction,
        rationale: `Estimated from causal propagation over ${info.basedOn.length} anchor signal(s).`,
      },
      kind: 'structured',
      confidence,
      basedOn: [...new Set(info.basedOn)],
      deadline: Date.now() + horizonMs,
      resolved: false,
    };
  });
}
