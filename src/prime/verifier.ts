import type { ForgeBenchmark } from '../types';

export interface VerificationResult {
  passed: boolean;
  confidence: number;
  notes: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function verifyResponse(
  response: string,
  benchmark: ForgeBenchmark,
  strictMode: boolean,
): VerificationResult {
  const text = response.toLowerCase();
  const mustHave = strictMode
    ? ['assumption', 'verify', 'risk', 'fallback']
    : ['verify', 'step'];

  let hits = 0;
  for (const token of mustHave) {
    if (text.includes(token)) hits += 1;
  }
  const structureScore = hits / mustHave.length;

  let keywordScore = 0;
  if (benchmark.expectedKeywords.length > 0) {
    let keywordHits = 0;
    for (const kw of benchmark.expectedKeywords) {
      if (text.includes(kw.toLowerCase())) keywordHits += 1;
    }
    keywordScore = keywordHits / benchmark.expectedKeywords.length;
  } else {
    keywordScore = 1;
  }

  const confidence = clamp01(structureScore * 0.65 + keywordScore * 0.35);
  const threshold = strictMode ? 0.62 : 0.45;
  const passed = confidence >= threshold;

  return {
    passed,
    confidence,
    notes: passed
      ? `Verifier pass (${(confidence * 100).toFixed(0)}%).`
      : `Verifier blocked: insufficient structure/evidence (${(confidence * 100).toFixed(0)}%).`,
  };
}
