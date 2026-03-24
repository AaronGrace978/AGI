export interface ConsolidationEpisode {
  id: string;
  content: string;
  source: string;
  importance: number;
  timestamp: number;
}

export interface ConsolidationResult {
  semantic: string[];
  procedural: string[];
  contradictions: string[];
  qualityByContent: Record<string, number>;
  duplicatesSuppressed: number;
  lowSignalDropped: number;
  processedCount: number;
  keptCount: number;
  avgQualityScore: number;
  precisionProxy: number;
  recallProxy: number;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function scoreEpisodeQuality(content: string, importance: number): number {
  const text = content.trim();
  if (!text) return 0;
  const tokens = tokenize(text);
  const tokenSet = new Set(tokens);
  const diversity = tokens.length > 0 ? tokenSet.size / tokens.length : 0;
  const hasActionableSignals =
    /\b(step|workflow|plan|verify|check|fallback|rollback|measure|result|because|therefore)\b/i.test(text);
  const hasSpecificity = /\b\d+\b|\/|\\|\.ts\b|\.js\b|error|latency|ms|%|\bif\b|\bthen\b/i.test(text);
  const tooGeneric = /\b(ok|good|nice|done|works|fine|cool)\b/i.test(text) && text.length < 60;
  const lengthScore = Math.min(1, text.length / 220);

  let score =
    0.25 * lengthScore +
    0.25 * diversity +
    0.25 * Math.max(0, Math.min(1, importance)) +
    0.25 * (hasActionableSignals ? 1 : 0);
  if (hasSpecificity) score += 0.1;
  if (tooGeneric) score -= 0.25;
  return Math.max(0, Math.min(1, score));
}

export function consolidateEpisodes(episodes: ConsolidationEpisode[]): ConsolidationResult {
  if (episodes.length === 0) {
    return {
      semantic: [],
      procedural: [],
      contradictions: [],
      qualityByContent: {},
      duplicatesSuppressed: 0,
      lowSignalDropped: 0,
      processedCount: 0,
      keptCount: 0,
      avgQualityScore: 0,
      precisionProxy: 0,
      recallProxy: 0,
    };
  }

  const semantic: string[] = [];
  const procedural: string[] = [];
  const contradictions: string[] = [];
  const seen = new Set<string>();
  const qualityByContent: Record<string, number> = {};
  let duplicatesSuppressed = 0;
  let lowSignalDropped = 0;
  let qualitySum = 0;
  let keptCount = 0;
  const LOW_SIGNAL_THRESHOLD = 0.34;

  for (const ep of episodes) {
    const n = normalize(ep.content);
    if (seen.has(n)) {
      duplicatesSuppressed += 1;
      continue;
    }
    seen.add(n);
    const quality = scoreEpisodeQuality(ep.content, ep.importance);
    if (quality < LOW_SIGNAL_THRESHOLD) {
      lowSignalDropped += 1;
      continue;
    }

    qualityByContent[ep.content.slice(0, 260)] = quality;
    qualitySum += quality;
    keptCount += 1;

    if (/\b(step|workflow|plan|procedure|first|then|finally)\b/i.test(ep.content)) {
      procedural.push(ep.content.slice(0, 260));
    } else {
      semantic.push(ep.content.slice(0, 260));
    }
  }

  const claimMap = new Map<string, Set<string>>();
  for (const text of semantic) {
    const m = text.match(/(.+?)\s+(is|are|causes|prevents)\s+(.+)/i);
    if (!m) continue;
    const subject = normalize(m[1]);
    const relation = normalize(m[2]);
    const object = normalize(m[3]);
    const key = `${subject}|${object}`;
    const relations = claimMap.get(key) || new Set<string>();
    relations.add(relation);
    claimMap.set(key, relations);
  }
  for (const [key, rels] of claimMap.entries()) {
    if (rels.has('causes') && rels.has('prevents')) {
      contradictions.push(`Contradiction detected for ${key}: causes vs prevents.`);
    }
  }

  return {
    semantic: semantic.slice(0, 8),
    procedural: procedural.slice(0, 8),
    contradictions: contradictions.slice(0, 6),
    qualityByContent,
    duplicatesSuppressed,
    lowSignalDropped,
    processedCount: episodes.length,
    keptCount,
    avgQualityScore: keptCount > 0 ? qualitySum / keptCount : 0,
    // Proxy metrics: precision ~ quality of kept memories; recall ~ retained signal ratio.
    precisionProxy: keptCount > 0 ? qualitySum / keptCount : 0,
    recallProxy: episodes.length > 0 ? keptCount / episodes.length : 0,
  };
}
