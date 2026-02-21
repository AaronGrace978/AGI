// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — NeuralCore Brain Module
//  Physics-Informed Neural Engine integration.
//
//  Provides pure functions for the store to manage neural state,
//  query predictions, and build context addenda for system prompts.
//
//  Architecture:
//    Python subprocess (neuralcore.bridge.serve) ←→ Electron main
//    process (NeuralCoreBridge) ←→ Preload IPC ←→ Store (this module)
//
//  The neural engine uses PINN-style constraint losses:
//    L_total = L_data + λ₁·L_causality + λ₂·L_safety + λ₃·L_fitts + λ₄·L_ui
//
//  Constraints encode "physics of UI interaction":
//    - Fitts's Law:  Movement time ∝ log₂(D/W + 1)
//    - Causality:    UI state transitions must follow valid sequences
//    - Safety:       Penalize destructive actions during training
//    - UI Physics:   Clicks must land within valid element bounds
// ═══════════════════════════════════════════════════════════════

import type {
  NeuralCoreState,
  NeuralPrediction,
  NeuralActionStep,
  NeuralTrainingProgress,
} from '../types';

// ─── Internal tracking (not persisted, lives in-process) ────────

let totalPredictions = 0;
let totalTrainingSessions = 0;
let cumulativeTrainingEpochs = 0;
let bestHistoricalLoss = Infinity;
let lastStatusCheckAt = 0;

// ─── Factory ────────────────────────────────────────────────────

export function createDefaultNeuralState(): NeuralCoreState {
  return {
    available: false,
    modelsLoaded: false,
    bridgeReady: false,
    lastPrediction: null,
    trainingStatus: 'idle',
    trainingProgress: null,
    trainingDomainCount: 0,
    lastError: null,
  };
}

// ─── Status ─────────────────────────────────────────────────────

export function updateNeuralFromStatus(
  state: NeuralCoreState,
  status: { available?: boolean; modelsLoaded?: boolean; predictor_loaded?: boolean; has_checkpoint?: boolean },
): NeuralCoreState {
  lastStatusCheckAt = Date.now();
  const wasOffline = !state.available;
  const nowOnline = status.available ?? state.available;

  return {
    ...state,
    available: nowOnline,
    modelsLoaded: status.modelsLoaded ?? status.predictor_loaded ?? state.modelsLoaded,
    bridgeReady: nowOnline,
    lastError: wasOffline && nowOnline ? null : state.lastError,
  };
}

// ─── Prediction ─────────────────────────────────────────────────

export function updateNeuralFromPrediction(
  state: NeuralCoreState,
  prediction: { steps?: NeuralActionStep[]; count?: number; error?: string },
): NeuralCoreState {
  if (prediction.error) {
    return { ...state, lastError: prediction.error };
  }

  totalPredictions++;
  const steps = prediction.steps ?? [];
  const pred: NeuralPrediction = {
    steps,
    count: prediction.count ?? steps.length,
    confidence: averageConfidence(steps),
    timestamp: Date.now(),
  };
  return { ...state, lastPrediction: pred, lastError: null };
}

// ─── Training ───────────────────────────────────────────────────

export function updateNeuralFromTrainingProgress(
  state: NeuralCoreState,
  progress: NeuralTrainingProgress,
): NeuralCoreState {
  return {
    ...state,
    trainingStatus: 'training',
    trainingProgress: progress,
  };
}

export function updateNeuralTrainingComplete(
  state: NeuralCoreState,
  result: { epochs_completed?: number; best_loss?: number; error?: string },
): NeuralCoreState {
  if (result.error) {
    return { ...state, trainingStatus: 'failed', lastError: result.error };
  }

  totalTrainingSessions++;
  if (result.epochs_completed) cumulativeTrainingEpochs += result.epochs_completed;
  if (result.best_loss !== undefined && result.best_loss < bestHistoricalLoss) {
    bestHistoricalLoss = result.best_loss;
  }

  return {
    ...state,
    trainingStatus: 'completed',
    modelsLoaded: true,
    lastError: null,
  };
}

// ─── Context Snapshots (for LLM system prompt injection) ────────

export interface NeuralContextSnapshot {
  available: boolean;
  modelsLoaded: boolean;
  lastPredictionAge?: number;
  lastPredictionConfidence?: number;
  predictionCount?: number;
  trainingSessions?: number;
  bestLoss?: number;
}

export function buildNeuralContextSnapshot(state: NeuralCoreState): NeuralContextSnapshot | null {
  if (!state.available) return null;

  const snap: NeuralContextSnapshot = {
    available: state.available,
    modelsLoaded: state.modelsLoaded,
  };

  if (state.lastPrediction) {
    snap.lastPredictionAge = Date.now() - state.lastPrediction.timestamp;
    snap.lastPredictionConfidence = state.lastPrediction.confidence;
  }
  if (totalPredictions > 0) snap.predictionCount = totalPredictions;
  if (totalTrainingSessions > 0) snap.trainingSessions = totalTrainingSessions;
  if (bestHistoricalLoss < Infinity) snap.bestLoss = bestHistoricalLoss;

  return snap;
}

export function buildNeuralContextString(snap: NeuralContextSnapshot | null): string {
  if (!snap) return '';

  const parts: string[] = ['=== NEURALCORE STATE ==='];
  parts.push(`Engine: ${snap.available ? 'ONLINE' : 'OFFLINE'}`);
  parts.push(`Trained Models: ${snap.modelsLoaded ? 'LOADED' : 'NOT YET TRAINED'}`);

  if (snap.lastPredictionConfidence !== undefined) {
    parts.push(`Last Prediction Confidence: ${(snap.lastPredictionConfidence * 100).toFixed(1)}%`);
  }
  if (snap.predictionCount) {
    parts.push(`Predictions Made: ${snap.predictionCount}`);
  }
  if (snap.trainingSessions) {
    parts.push(`Training Sessions: ${snap.trainingSessions} (${cumulativeTrainingEpochs} total epochs)`);
  }
  if (snap.bestLoss !== undefined) {
    parts.push(`Best Training Loss: ${snap.bestLoss.toFixed(6)}`);
  }

  if (snap.modelsLoaded) {
    parts.push('Neural action prediction available — can generate physics-informed UI action plans');
  } else {
    parts.push('Neural engine ready but untrained — record demonstrations then train to enable learned action policies');
  }

  parts.push('=== END NEURALCORE ===');
  return parts.join('\n');
}

// ─── Debug / Diagnostics ────────────────────────────────────────

export interface NeuralDebugState {
  totalPredictions: number;
  totalTrainingSessions: number;
  cumulativeTrainingEpochs: number;
  bestHistoricalLoss: number;
  lastStatusCheckAt: number;
}

export function getNeuralDebugState(): NeuralDebugState {
  return {
    totalPredictions,
    totalTrainingSessions,
    cumulativeTrainingEpochs,
    bestHistoricalLoss,
    lastStatusCheckAt,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function averageConfidence(steps: NeuralActionStep[]): number {
  if (steps.length === 0) return 0;
  const withConf = steps.filter((s) => typeof s.confidence === 'number');
  if (withConf.length === 0) return 0.5;
  return withConf.reduce((sum, s) => sum + s.confidence!, 0) / withConf.length;
}
