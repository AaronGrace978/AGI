// ═══════════════════════════════════════════════════════════════
//  AUTONOMOUS LEARNER — Curiosity-Driven Knowledge Acquisition
//  The system that lets AGI Prime teach itself.
//
//  Flow:
//  1. SPARK's curiosity engine identifies knowledge gaps
//  2. Gaps become research questions
//  3. Questions become web searches on trusted sources
//  4. Fetched content gets verified for bias and quality
//  5. Verified content gets extracted into world model
//  6. New knowledge creates new gaps → cycle repeats
//
//  "It doesn't learn what you tell it to learn.
//   It learns what it's curious about."
// ═══════════════════════════════════════════════════════════════

import type { GenerateFn } from './runtime';
import type { CuriosityQuestion, WorldEntity, WorldRelation, WorldModel } from '../types';
import {
  isVerifiedSource,
  isBlockedUrl,
  buildSourceTargetedQuery,
  calculateTrustScore,
  getSourceInfo,
} from './knowledge-sources';
import { verifyContent, quickCheck } from './fact-verifier';
import { extractKnowledge } from './spark';
import { storeMemory } from './memory';

// ─── Types ──────────────────────────────────────────────────

export interface LearningSession {
  id: string;
  startedAt: number;
  question: CuriosityQuestion;
  searchQueries: string[];
  candidateUrls: string[];
  fetchedPages: FetchedPage[];
  verifiedContent: VerifiedContent[];
  extractedKnowledge: { entities: WorldEntity[]; relations: WorldRelation[] };
  status: 'searching' | 'fetching' | 'verifying' | 'extracting' | 'complete' | 'failed';
  log: string[];
  duration?: number;
}

interface FetchedPage {
  url: string;
  title: string;
  content: string;
  trustScore: number;
}

interface VerifiedContent {
  url: string;
  title: string;
  content: string;
  score: number;
  claims: string[];
  category: string;
}

interface WebFetchResult {
  success: boolean;
  content?: string;
  url?: string;
  error?: string;
  truncated?: boolean;
}

interface WebSearchResult {
  success: boolean;
  results?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  error?: string;
}

export interface LearnerConfig {
  maxPagesPerSession: number;
  minVerificationScore: number;
  maxConcurrentSessions: number;
  cooldownMs: number;
  maxContentLength: number;
  preferredTier: 1 | 2 | 3;
}

export interface LearnerStats {
  totalSessions: number;
  totalPagesVerified: number;
  totalPagesAccepted: number;
  totalPagesRejected: number;
  totalEntitiesLearned: number;
  totalRelationsLearned: number;
  topDomains: Array<{ domain: string; count: number }>;
  recentSessions: LearningSession[];
  lastRunAt: number | null;
}

// ─── State ──────────────────────────────────────────────────

const DEFAULT_CONFIG: LearnerConfig = {
  maxPagesPerSession: 5,
  minVerificationScore: 0.35,
  maxConcurrentSessions: 1,
  cooldownMs: 60_000, // 1 minute between sessions
  maxContentLength: 12_000,
  preferredTier: 2,
};

let config = { ...DEFAULT_CONFIG };
let sessions: LearningSession[] = [];
let lastRunAt: number | null = null;
const domainCounts = new Map<string, number>();
let totalEntities = 0;
let totalRelations = 0;
let totalAccepted = 0;
let totalRejected = 0;
let active = false;

// ─── Core Learning Cycle ────────────────────────────────────

function uid(): string {
  return `learn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function log(session: LearningSession, msg: string) {
  session.log.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

/**
 * Turn a curiosity question into effective web search queries.
 * Uses the LLM to reformulate the question into 2-3 targeted searches.
 */
async function questionToSearchQueries(question: CuriosityQuestion, generate: GenerateFn): Promise<string[]> {
  const prompt = `Convert this research question into 2-3 effective web search queries that would find peer-reviewed research, scientific papers, or authoritative reference material.

QUESTION: "${question.question}"
DOMAIN: ${question.domain}

Rules:
- Target academic/scientific sources (use terms like "research", "study", "review", "mechanism")
- Be specific enough to get relevant results, not too broad
- Avoid opinion-seeking queries (no "best", "should", "why I think")
- Each query should approach the topic from a different angle

Output ONLY a JSON array of strings:
["query 1", "query 2", "query 3"]`;

  try {
    const response = await generate(
      [
        { role: 'system', content: 'You are a research librarian. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.3, maxTokens: 256 },
    );

    const match = response.match(/\[[\s\S]*\]/);
    if (!match) return [question.question];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 3) : [question.question];
  } catch {
    return [question.question];
  }
}

/**
 * Search the web using IPC, filtering results through the trust registry.
 */
async function searchForKnowledge(
  queries: string[],
  webSearch: (q: string, opts?: Record<string, unknown>) => Promise<unknown>,
  session: LearningSession,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const allResults: Array<{ title: string; url: string; snippet: string }> = [];
  const seenUrls = new Set<string>();

  for (const query of queries) {
    const targeted = buildSourceTargetedQuery(query, config.preferredTier);
    log(session, `Searching: "${query}"`);

    try {
      const raw = (await webSearch(targeted, { maxResults: 10 })) as WebSearchResult;
      if (!raw.success || !raw.results) {
        log(session, `  Search failed: ${raw.error || 'no results'}`);
        continue;
      }

      for (const r of raw.results) {
        if (seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);

        if (isBlockedUrl(r.url)) {
          log(session, `  Blocked: ${r.url}`);
          continue;
        }

        const preCheck = quickCheck(r.title, r.url);
        if (!preCheck.likely_good) {
          log(session, `  Skipped: ${r.title} (${preCheck.reason})`);
          continue;
        }

        allResults.push(r);
        log(session, `  Candidate: ${r.title} [${getSourceInfo(r.url)?.name || 'unknown'}]`);
      }
    } catch (e) {
      log(session, `  Search error: ${e}`);
    }
  }

  // Sort by trust score (highest first)
  allResults.sort((a, b) => calculateTrustScore(b.url) - calculateTrustScore(a.url));
  return allResults.slice(0, config.maxPagesPerSession * 2); // 2x candidates to account for fetch failures
}

/**
 * Fetch page content via IPC and strip to text.
 */
async function fetchPage(
  url: string,
  webFetch: (url: string, opts?: Record<string, unknown>) => Promise<unknown>,
  session: LearningSession,
): Promise<FetchedPage | null> {
  log(session, `Fetching: ${url}`);
  try {
    const result = (await webFetch(url, {
      maxLength: config.maxContentLength,
      timeout: 15_000,
    })) as WebFetchResult;

    if (!result.success || !result.content) {
      log(session, `  Fetch failed: ${result.error || 'empty'}`);
      return null;
    }

    // Extract a rough title from the content if present
    const titleMatch = result.content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || url;

    // Strip HTML if raw HTML was returned
    let content = result.content;
    if (content.includes('<html') || content.includes('<body')) {
      content = content
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (content.length < 100) {
      log(session, '  Content too short after stripping');
      return null;
    }

    const trustScore = calculateTrustScore(url);
    log(session, `  Fetched ${content.length} chars (trust: ${trustScore.toFixed(2)})`);

    return { url, title, content: content.slice(0, config.maxContentLength), trustScore };
  } catch (e) {
    log(session, `  Fetch error: ${e}`);
    return null;
  }
}

/**
 * Run a complete learning session for a single curiosity question.
 */
export async function runLearningSession(
  question: CuriosityQuestion,
  worldModel: WorldModel,
  generate: GenerateFn,
  webFetch: (url: string, opts?: Record<string, unknown>) => Promise<unknown>,
  webSearch: (q: string, opts?: Record<string, unknown>) => Promise<unknown>,
  onLog?: (msg: string) => void,
): Promise<LearningSession> {
  const session: LearningSession = {
    id: uid(),
    startedAt: Date.now(),
    question,
    searchQueries: [],
    candidateUrls: [],
    fetchedPages: [],
    verifiedContent: [],
    extractedKnowledge: { entities: [], relations: [] },
    status: 'searching',
    log: [],
  };

  const emit = (msg: string) => {
    log(session, msg);
    onLog?.(msg);
  };

  try {
    emit(`--- Learning Session: "${question.question}" ---`);
    emit(`Domain: ${question.domain}, Priority: ${question.priority.toFixed(2)}`);

    // Phase 1: Generate search queries
    session.searchQueries = await questionToSearchQueries(question, generate);
    emit(`Generated ${session.searchQueries.length} search queries`);

    // Phase 2: Search and filter candidates
    session.status = 'fetching';
    const candidates = await searchForKnowledge(session.searchQueries, webSearch, session);
    session.candidateUrls = candidates.map((c) => c.url);
    emit(`Found ${candidates.length} candidate pages`);

    if (candidates.length === 0) {
      session.status = 'failed';
      emit('No suitable sources found');
      session.duration = Date.now() - session.startedAt;
      sessions.push(session);
      return session;
    }

    // Phase 3: Fetch top pages
    let fetchCount = 0;
    for (const candidate of candidates) {
      if (fetchCount >= config.maxPagesPerSession) break;
      const page = await fetchPage(candidate.url, webFetch, session);
      if (page) {
        session.fetchedPages.push(page);
        fetchCount++;
      }
    }
    emit(`Successfully fetched ${session.fetchedPages.length} pages`);

    // Phase 4: Verify content quality
    session.status = 'verifying';
    for (const page of session.fetchedPages) {
      const verification = await verifyContent(page.content, page.title, page.url, generate);

      if (verification.passed && verification.score >= config.minVerificationScore) {
        session.verifiedContent.push({
          url: page.url,
          title: page.title,
          content: page.content,
          score: verification.score,
          claims: verification.extractedClaims,
          category: verification.category,
        });
        totalAccepted++;
        trackDomain(page.url);
        emit(`  ACCEPTED: ${page.title} (score: ${verification.score.toFixed(2)}, cat: ${verification.category})`);
      } else {
        totalRejected++;
        emit(
          `  REJECTED: ${page.title} (score: ${verification.score.toFixed(2)}, flags: ${verification.flags.join(', ')})`,
        );
      }
    }
    emit(`Verified: ${session.verifiedContent.length}/${session.fetchedPages.length} passed`);

    // Phase 5: Extract knowledge into world model
    session.status = 'extracting';
    if (session.verifiedContent.length > 0) {
      const combinedText = session.verifiedContent
        .map((vc) => `[Source: ${vc.title}]\n${vc.content.slice(0, 2000)}`)
        .join('\n\n---\n\n');

      const { entities, relations } = await extractKnowledge(combinedText, worldModel.entities, generate);

      session.extractedKnowledge = { entities, relations };
      totalEntities += entities.length;
      totalRelations += relations.length;
      emit(`Extracted: ${entities.length} entities, ${relations.length} relations`);

      // Store in semantic memory
      for (const vc of session.verifiedContent) {
        try {
          await storeMemory(`[Learned] ${vc.title}: ${vc.claims.join('. ') || vc.content.slice(0, 500)}`, 'semantic', {
            source: 'autonomous-learner',
            importance: Math.min(1, vc.score + 0.1),
            tags: ['auto-learned', vc.category, question.domain],
          });
        } catch {
          emit('  Memory storage failed for one item');
        }
      }
    }

    session.status = 'complete';
    session.duration = Date.now() - session.startedAt;
    emit(`Session complete in ${(session.duration / 1000).toFixed(1)}s`);
    emit(
      `Knowledge gained: +${session.extractedKnowledge.entities.length}E / +${session.extractedKnowledge.relations.length}R`,
    );
  } catch (e) {
    session.status = 'failed';
    session.duration = Date.now() - session.startedAt;
    emit(`Session failed: ${e}`);
  }

  sessions.push(session);
  if (sessions.length > 100) sessions = sessions.slice(-100);
  lastRunAt = Date.now();
  return session;
}

// ─── Autonomous Cycle (called from SPARK) ───────────────────

/**
 * Select the best question to investigate from SPARK's curiosity queue.
 * Prioritizes high-priority, open questions in domains we haven't
 * over-explored yet.
 */
export function selectQuestionForResearch(questions: CuriosityQuestion[]): CuriosityQuestion | null {
  const open = questions.filter((q) => q.status === 'open' || q.status === 'investigating');
  if (open.length === 0) return null;

  // Score each question: priority * domain-novelty-bonus
  const scored = open.map((q) => {
    const domainExplored = sessions.filter((s) => s.question.domain === q.domain).length;
    const noveltyBonus = 1 / (1 + domainExplored * 0.2);
    return { question: q, score: q.priority * noveltyBonus };
  });

  scored.sort((a, b) => b.score - a.score);

  // Weighted random from top 3 to maintain exploration diversity
  const top = scored.slice(0, 3);
  const totalScore = top.reduce((s, t) => s + t.score, 0);
  if (totalScore === 0) return top[0]?.question ?? null;

  let r = Math.random() * totalScore;
  for (const t of top) {
    r -= t.score;
    if (r <= 0) return t.question;
  }
  return top[0]?.question ?? null;
}

/**
 * Check if the learner is ready for another session.
 */
export function canRunSession(): boolean {
  if (!active) return false;
  if (lastRunAt && Date.now() - lastRunAt < config.cooldownMs) return false;
  const runningSessions = sessions.filter((s) => s.status !== 'complete' && s.status !== 'failed');
  return runningSessions.length < config.maxConcurrentSessions;
}

// ─── Configuration & Stats ──────────────────────────────────

export function setActive(isActive: boolean) {
  active = isActive;
}
export function isActive(): boolean {
  return active;
}

export function updateConfig(partial: Partial<LearnerConfig>) {
  config = { ...config, ...partial };
}

export function getConfig(): LearnerConfig {
  return { ...config };
}

export function getStats(): LearnerStats {
  return {
    totalSessions: sessions.length,
    totalPagesVerified: totalAccepted + totalRejected,
    totalPagesAccepted: totalAccepted,
    totalPagesRejected: totalRejected,
    totalEntitiesLearned: totalEntities,
    totalRelationsLearned: totalRelations,
    topDomains: [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count })),
    recentSessions: sessions.slice(-10).map((s) => ({
      ...s,
      fetchedPages: s.fetchedPages.map((p) => ({ ...p, content: p.content.slice(0, 200) + '...' })),
      verifiedContent: s.verifiedContent.map((v) => ({ ...v, content: v.content.slice(0, 200) + '...' })),
    })),
    lastRunAt,
  };
}

export function getRecentLogs(count = 5): string[][] {
  return sessions.slice(-count).map((s) => s.log);
}

// ─── Helpers ────────────────────────────────────────────────

function trackDomain(url: string) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  } catch {
    /* ignore */
  }
}
