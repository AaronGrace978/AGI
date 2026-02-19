import type {
  AgiRubricConfig,
  AgiRubricWeights,
  AgiScoreSnapshot,
  AgiSubscoreKey,
  AgiSubscores,
  GauntletCapability,
  GauntletCategory,
  GauntletRunSnapshot,
} from '../types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function to10(score01: number): number {
  return clamp(score01 * 10, 0, 10);
}

export const DEFAULT_AGI_RUBRIC_CONFIG: AgiRubricConfig = {
  version: 1,
  // Matches the rubric weights described by the operator: 0.35 split across reasoning+flexibility,
  // plus 0.2 domain, 0.2 autonomy, 0.15 self-modeling, 0.1 creativity.
  weights: {
    abstractReasoningLogic: 0.2,
    learningFlexibility: 0.15,
    domainGenerality: 0.2,
    autonomousGoalSetting: 0.2,
    selfModelingMetaCognition: 0.15,
    creativeProblemSolving: 0.1,
  },
  // Cap DomainGenerality if we have zero real-workflow evidence.
  requireRealWorkflowCountForFullCredit: 1,
  optimizeInAutoCycle: true,
};

export function normalizeWeights(weights: AgiRubricWeights): AgiRubricWeights {
  const keys = Object.keys(DEFAULT_AGI_RUBRIC_CONFIG.weights) as AgiSubscoreKey[];
  const sum = keys.reduce((acc, k) => acc + (Number(weights?.[k]) || 0), 0);
  if (!Number.isFinite(sum) || sum <= 0) return { ...DEFAULT_AGI_RUBRIC_CONFIG.weights };
  const normalized: Partial<AgiRubricWeights> = {};
  for (const k of keys) normalized[k] = (Number(weights[k]) || 0) / sum;
  return normalized as AgiRubricWeights;
}

export function computeWeightedTotal(subscores: AgiSubscores, weights: AgiRubricWeights): number {
  const norm = normalizeWeights(weights);
  const keys = Object.keys(norm) as AgiSubscoreKey[];
  const total = keys.reduce((acc, k) => acc + clamp(subscores[k] ?? 0, 0, 10) * (norm[k] ?? 0), 0);
  return clamp(total, 0, 10);
}

function categoryScore01(params: {
  category: GauntletCategory;
  run: GauntletRunSnapshot;
  capabilities: GauntletCapability[];
}): number {
  const { category, run, capabilities } = params;
  const capById = new Map(capabilities.map((c) => [c.id, c]));
  const scores: number[] = [];
  for (const r of run.results || []) {
    const cap = capById.get(r.capabilityId);
    if (!cap || cap.category !== category) continue;
    scores.push(clamp01(r.score ?? 0));
  }
  if (scores.length === 0) return 0;
  return clamp01(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function capabilityScore01(run: GauntletRunSnapshot, id: string): number | null {
  const hit = (run.results || []).find((r) => r.capabilityId === id);
  if (!hit) return null;
  return clamp01(hit.score ?? 0);
}

function computeSubscoresFromGauntlet(params: {
  run: GauntletRunSnapshot;
  capabilities: GauntletCapability[];
  config: AgiRubricConfig;
}): AgiSubscores {
  const { run, capabilities, config } = params;

  const reasoning01 = categoryScore01({ category: 'reasoning', run, capabilities });
  const planning01 = categoryScore01({ category: 'planning', run, capabilities });
  const execution01 = categoryScore01({ category: 'execution', run, capabilities });
  const robustness01 = categoryScore01({ category: 'robustness', run, capabilities });
  const creativity01 = categoryScore01({ category: 'creativity', run, capabilities });
  const meta01 = categoryScore01({ category: 'meta-cognition', run, capabilities });

  const pie01 = capabilityScore01(run, 'pie-arc-bench'); // deterministic anchor when present

  // Learning flexibility: prefer explicit few-shot benchmark if present, else curriculum proxy via meta/planning blend.
  const fewShot01 =
    capabilityScore01(run, 'few-shot-learning')
    ?? capabilityScore01(run, 'creative-transfer') // weak proxy if suite is older
    ?? null;

  // Autonomous goal-setting: prefer explicit goal-setting benchmarks when present.
  const goalDecomp01 = capabilityScore01(run, 'goal-setting-decomposition');
  const goalExec01 = capabilityScore01(run, 'goal-setting-execution-sandbox');

  // Domain generality: diversity across categories + real-workflow provenance evidence.
  const catVector = [reasoning01, planning01, execution01, robustness01, creativity01, meta01];
  const catMean = catVector.reduce((a, b) => a + b, 0) / catVector.length;
  const catVariance = catVector.reduce((a, v) => a + (v - catMean) ** 2, 0) / catVector.length;
  const diversity01 = clamp01(1 - Math.sqrt(catVariance) * 1.25); // lower variance => more balanced => more general

  const realWorkflowCount = run.provenanceRollups?.['real-workflow']?.count ?? 0;
  const realWorkflowScore01 = run.provenanceRollups?.['real-workflow']?.overallScore ?? 0;
  const provenanceBoost01 = clamp01(realWorkflowScore01 * 0.6 + clamp01(realWorkflowCount / 3) * 0.4);

  let domainGenerality01 = clamp01(catMean * 0.65 + diversity01 * 0.25 + provenanceBoost01 * 0.1);
  if (realWorkflowCount < (config.requireRealWorkflowCountForFullCredit || 0)) {
    // Prevent a purely synthetic run from claiming full domain generality.
    domainGenerality01 = Math.min(domainGenerality01, 0.65);
  }

  const abstractReasoning01 = clamp01(
    (pie01 !== null ? (pie01 * 0.55 + reasoning01 * 0.45) : reasoning01)
  );

  const learningFlexibility01 = clamp01(
    fewShot01 !== null
      ? (fewShot01 * 0.7 + planning01 * 0.3)
      : (planning01 * 0.55 + meta01 * 0.45)
  );

  const autonomousGoalSetting01 = clamp01(
    goalDecomp01 !== null || goalExec01 !== null
      ? clamp01((goalDecomp01 ?? planning01) * 0.55 + (goalExec01 ?? execution01) * 0.45)
      : clamp01(planning01 * 0.65 + execution01 * 0.35)
  );

  const selfModel01 = clamp01(meta01 * 0.7 + robustness01 * 0.3);
  const creative01 = clamp01(creativity01 * 0.8 + reasoning01 * 0.2);

  return {
    abstractReasoningLogic: to10(abstractReasoning01),
    learningFlexibility: to10(learningFlexibility01),
    domainGenerality: to10(domainGenerality01),
    autonomousGoalSetting: to10(autonomousGoalSetting01),
    selfModelingMetaCognition: to10(selfModel01),
    creativeProblemSolving: to10(creative01),
  };
}

export function computeAgiScoreSnapshot(params: {
  config?: AgiRubricConfig | null;
  gauntletRun?: GauntletRunSnapshot | null;
  gauntletCapabilities?: GauntletCapability[] | null;
  id?: string;
  createdAt?: number;
  notes?: string;
}): AgiScoreSnapshot | null {
  const run = params.gauntletRun;
  const caps = params.gauntletCapabilities;
  if (!run || !caps || !Array.isArray(run.results) || caps.length === 0) return null;

  const cfg = params.config ?? DEFAULT_AGI_RUBRIC_CONFIG;
  const subscores = computeSubscoresFromGauntlet({ run, capabilities: caps, config: cfg });
  const total = computeWeightedTotal(subscores, cfg.weights);

  const createdAt = params.createdAt ?? Date.now();
  const id = params.id ?? `agi_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    createdAt,
    rubricVersion: cfg.version,
    weights: normalizeWeights(cfg.weights),
    subscores,
    total,
    inputs: {
      gauntletRunId: run.runId,
      gauntletOverallScore: run.overallScore,
      gauntletPassRate: run.passRate,
      gauntletProvenance: run.provenanceRollups,
      notes: params.notes,
    },
  };
}

