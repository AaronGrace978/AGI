// ═══════════════════════════════════════════════════════════════
//  FACT VERIFIER — Truth Filter for Autonomous Learning
//  Uses LLM analysis + heuristic checks to filter out:
//  - Political bias and loaded language
//  - Opinion disguised as fact
//  - Pseudoscience and unfalsifiable claims
//  - Emotional manipulation and sensationalism
//  - Advertising and promotional content
//
//  Only evidence-based, verifiable, citation-backed content passes.
// ═══════════════════════════════════════════════════════════════

import type { GenerateFn } from './runtime';
import { calculateTrustScore, isBlockedUrl } from './knowledge-sources';

export interface VerificationResult {
  passed: boolean;
  score: number; // 0-1 overall quality
  trustScore: number; // source trust
  objectivityScore: number; // 0-1 how objective
  evidenceScore: number; // 0-1 how evidence-backed
  flags: string[]; // reasons for rejection or concern
  category: 'factual' | 'scientific' | 'educational' | 'opinion' | 'promotional' | 'rejected';
  extractedClaims: string[]; // key factual claims
}

// ─── Heuristic Bias Detection ───────────────────────────────

const LOADED_LANGUAGE_PATTERNS = [
  /\b(slammed|blasted|destroyed|eviscerated|obliterated)\b/gi,
  /\b(shocking|outrageous|disgusting|horrifying|terrifying)\b/gi,
  /\b(radical|extremist|far-left|far-right|woke|anti-woke)\b/gi,
  /\b(fake news|mainstream media|deep state|big pharma)\b/gi,
  /\b(patriots?|traitors?|enemies of the people)\b/gi,
  /\b(liberal agenda|conservative agenda|left-wing|right-wing)\b/gi,
  /\b(democrat[s]?|republican[s]?|gop|dnc|maga)\b/gi,
  /\b(they don't want you to know|the truth they're hiding)\b/gi,
  /\b(wake up|sheeple|open your eyes)\b/gi,
];

const OPINION_INDICATORS = [
  /\b(I think|I believe|in my opinion|it seems to me)\b/gi,
  /\b(arguably|supposedly|allegedly|so-called)\b/gi,
  /\b(should|must|need to|have to|ought to)\b/gi, // prescriptive language
  /\b(clearly|obviously|undeniably|unquestionably)\b/gi, // false certainty
];

const PROMOTIONAL_PATTERNS = [
  /\b(buy now|order now|limited time|act fast|click here)\b/gi,
  /\b(discount|coupon|promo code|free trial|subscribe)\b/gi,
  /\b(sponsored|advertisement|partner content|paid post)\b/gi,
  /\b(affiliate|referral link|earn money|make money)\b/gi,
];

const PSEUDOSCIENCE_PATTERNS = [
  /\b(miracle cure|100% guaranteed|doctors hate this)\b/gi,
  /\b(big pharma doesn't want|suppressed cure|ancient secret)\b/gi,
  /\b(detox|cleanse|toxins|chakra|crystal healing)\b/gi,
  /\b(quantum healing|vibrational frequency|manifesting)\b/gi,
  /\b(astrology|horoscope|psychic reading|fortune telling)\b/gi,
];

const EVIDENCE_INDICATORS = [
  /\b(study|studies|research|researchers|scientists)\b/gi,
  /\b(published in|journal|peer-reviewed|meta-analysis)\b/gi,
  /\b(data shows|evidence suggests|findings indicate)\b/gi,
  /\b(according to|cited by|referenced in)\b/gi,
  /\b(experiment|trial|sample size|control group|p-value)\b/gi,
  /\b(doi:|pmid:|isbn:|issn:)\b/gi,
  /\b(university of|institute of|department of)\b/gi,
  /et al\./gi,
  /\(\d{4}\)/g, // year citations like (2024)
];

// ─── Heuristic Analysis ─────────────────────────────────────

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

function heuristicAnalysis(content: string, title: string, url: string) {
  const fullText = `${title} ${content}`;
  const wordCount = fullText.split(/\s+/).length;
  if (wordCount < 20) return { objectivity: 0, evidence: 0, flags: ['Content too short'] };

  const loadedCount = countMatches(fullText, LOADED_LANGUAGE_PATTERNS);
  const opinionCount = countMatches(fullText, OPINION_INDICATORS);
  const promoCount = countMatches(fullText, PROMOTIONAL_PATTERNS);
  const pseudoCount = countMatches(fullText, PSEUDOSCIENCE_PATTERNS);
  const evidenceCount = countMatches(fullText, EVIDENCE_INDICATORS);

  const flags: string[] = [];

  // Normalize by word count (per 100 words)
  const loadedDensity = (loadedCount / wordCount) * 100;
  const opinionDensity = (opinionCount / wordCount) * 100;
  const promoDensity = (promoCount / wordCount) * 100;
  const pseudoDensity = (pseudoCount / wordCount) * 100;
  const evidenceDensity = (evidenceCount / wordCount) * 100;

  if (loadedDensity > 1.5) flags.push(`High loaded language density (${loadedDensity.toFixed(1)}/100w)`);
  if (opinionDensity > 3.0) flags.push(`Heavy opinion language (${opinionDensity.toFixed(1)}/100w)`);
  if (promoDensity > 0.5) flags.push('Promotional content detected');
  if (pseudoDensity > 0.5) flags.push('Pseudoscience markers detected');
  if (isBlockedUrl(url)) flags.push('URL is on blocked list');

  // Objectivity: penalized by loaded language + opinion + pseudo
  const biasScore = Math.min(1, (loadedDensity + opinionDensity * 0.5 + pseudoDensity * 2) / 5);
  const objectivity = Math.max(0, 1 - biasScore);

  // Evidence: rewarded by citations, studies, data references
  const evidence = Math.min(1, evidenceDensity / 3);

  return { objectivity, evidence, flags };
}

// ─── LLM-Based Deep Verification ────────────────────────────

async function llmVerify(
  content: string,
  title: string,
  generate: GenerateFn,
): Promise<{ objectivity: number; evidence: number; claims: string[]; category: string; flags: string[] }> {
  const prompt = `Analyze this content for factual quality. You are a strict truth filter — only evidence-based, verifiable content passes.

TITLE: "${title}"
CONTENT (first 1500 chars):
"${content.slice(0, 1500)}"

Evaluate on these criteria:
1. OBJECTIVITY (0-1): Is this factual reporting or opinion? Does it use neutral language? Is it free of political bias in ANY direction?
2. EVIDENCE (0-1): Does it cite sources, studies, data? Are claims verifiable?
3. CATEGORY: One of: "factual" (verified facts), "scientific" (research-based), "educational" (teaching material), "opinion" (subjective views), "promotional" (selling something), "rejected" (fails quality)
4. KEY CLAIMS: Extract 2-4 specific factual claims that could be independently verified. Skip vague statements.
5. FLAGS: List any concerns (bias detected, unsupported claims, emotional manipulation, political framing, etc.)

REJECTION CRITERIA (category = "rejected" if ANY apply):
- Political content or framing from any direction
- Opinion presented as fact without evidence
- Pseudoscience or unfalsifiable claims
- Promotional or advertising content
- Conspiracy theories or misinformation
- Emotional manipulation without substance

Output ONLY valid JSON:
{"objectivity": 0.0, "evidence": 0.0, "category": "...", "claims": ["..."], "flags": ["..."]}`;

  try {
    const response = await generate(
      [
        {
          role: 'system',
          content: 'You are a strict factual quality assessor. Output only valid JSON. No mercy for bias or opinion.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.1, maxTokens: 512 },
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return { objectivity: 0.5, evidence: 0.5, claims: [], category: 'factual', flags: ['LLM parse failed'] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      objectivity: Math.max(0, Math.min(1, Number(parsed.objectivity) || 0.5)),
      evidence: Math.max(0, Math.min(1, Number(parsed.evidence) || 0.5)),
      claims: Array.isArray(parsed.claims) ? parsed.claims.map(String).slice(0, 5) : [],
      category: parsed.category || 'factual',
      flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
    };
  } catch {
    return {
      objectivity: 0.5,
      evidence: 0.5,
      claims: [],
      category: 'factual',
      flags: ['LLM verification unavailable'],
    };
  }
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Full verification pipeline: heuristic analysis + optional LLM deep check.
 * Returns a VerificationResult with pass/fail and detailed scores.
 */
export async function verifyContent(
  content: string,
  title: string,
  url: string,
  generate?: GenerateFn,
): Promise<VerificationResult> {
  // Step 1: Source trust
  if (isBlockedUrl(url)) {
    return {
      passed: false,
      score: 0,
      trustScore: 0,
      objectivityScore: 0,
      evidenceScore: 0,
      flags: ['Blocked source'],
      category: 'rejected',
      extractedClaims: [],
    };
  }

  const trustScore = calculateTrustScore(url);

  // Step 2: Heuristic analysis
  const heuristic = heuristicAnalysis(content, title, url);

  // Step 3: LLM deep verification (if generate function available)
  let llmResult: Awaited<ReturnType<typeof llmVerify>> | null = null;
  if (generate && content.length > 100) {
    llmResult = await llmVerify(content, title, generate);
  }

  // Step 4: Combine scores
  const objectivityScore = llmResult
    ? heuristic.objectivity * 0.4 + llmResult.objectivity * 0.6
    : heuristic.objectivity;

  const evidenceScore = llmResult ? heuristic.evidence * 0.4 + llmResult.evidence * 0.6 : heuristic.evidence;

  const allFlags = [...heuristic.flags, ...(llmResult?.flags || [])];

  const category =
    (llmResult?.category as VerificationResult['category']) ||
    (evidenceScore > 0.6 ? 'scientific' : objectivityScore > 0.5 ? 'factual' : 'opinion');

  // Final composite score: trust * (objectivity + evidence) / 2
  const score = trustScore * ((objectivityScore + evidenceScore) / 2);

  // Pass threshold: score >= 0.35 AND not rejected AND not too many flags
  const passed = score >= 0.35 && category !== 'rejected' && category !== 'promotional' && allFlags.length < 5;

  return {
    passed,
    score,
    trustScore,
    objectivityScore,
    evidenceScore,
    flags: allFlags,
    category,
    extractedClaims: llmResult?.claims || [],
  };
}

/**
 * Quick heuristic-only check (no LLM call). Useful for pre-filtering
 * before fetching full content.
 */
export function quickCheck(title: string, url: string): { likely_good: boolean; reason: string } {
  if (isBlockedUrl(url)) return { likely_good: false, reason: 'blocked source' };

  const trust = calculateTrustScore(url);
  if (trust >= 0.6) return { likely_good: true, reason: `trusted source (trust=${trust})` };

  const loadedCount = countMatches(title, LOADED_LANGUAGE_PATTERNS);
  if (loadedCount > 0) return { likely_good: false, reason: 'loaded language in title' };

  const pseudoCount = countMatches(title, PSEUDOSCIENCE_PATTERNS);
  if (pseudoCount > 0) return { likely_good: false, reason: 'pseudoscience markers in title' };

  if (trust > 0) return { likely_good: true, reason: 'no red flags detected' };
  return { likely_good: false, reason: 'unknown source' };
}
