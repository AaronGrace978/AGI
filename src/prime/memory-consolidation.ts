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
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function consolidateEpisodes(episodes: ConsolidationEpisode[]): ConsolidationResult {
  if (episodes.length === 0) {
    return { semantic: [], procedural: [], contradictions: [] };
  }

  const semantic: string[] = [];
  const procedural: string[] = [];
  const contradictions: string[] = [];
  const seen = new Set<string>();

  for (const ep of episodes) {
    const n = normalize(ep.content);
    if (seen.has(n)) continue;
    seen.add(n);

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
  };
}
