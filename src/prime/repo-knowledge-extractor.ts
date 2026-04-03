import type { GenerateFn } from './runtime';
import type { RepoSummary } from './repo-quality-gate';

export type KnowledgeEntryType = 'architecture' | 'api' | 'technique' | 'documentation' | 'tooling';

export interface RepoFileSample {
  path: string;
  content: string;
}

export interface KnowledgeEntry {
  id: string;
  content: string;
  type: KnowledgeEntryType;
  source: string;
  confidence: number; // 0..1
  tags: string[];
}

export interface RepoKnowledgeExtractionInput {
  repo: RepoSummary;
  readmeContent?: string | null;
  sampledFiles: RepoFileSample[];
  generate?: GenerateFn;
  maxEntries: number;
}

export interface RepoKnowledgeExtractionResult {
  entries: KnowledgeEntry[];
  warnings: string[];
}

interface LlmExtractionPayload {
  architecture: Array<{ insight: string; confidence?: number; tags?: string[] }>;
  apiSurfaces: Array<{ insight: string; confidence?: number; tags?: string[] }>;
  techniques: Array<{ insight: string; confidence?: number; tags?: string[] }>;
  documentation: Array<{ insight: string; confidence?: number; tags?: string[] }>;
  tooling: Array<{ insight: string; confidence?: number; tags?: string[] }>;
}

const DEFAULT_MAX_ENTRIES = 20;

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function cleanInsight(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
}

function normalizeTags(tags: string[] | undefined, fallback: string[]): string[] {
  const merged = [...(tags || []), ...fallback];
  const cleaned = merged
    .map((tag) =>
      String(tag || '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, 10);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickExcerpt(text: string, maxChars: number): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .slice(0, maxChars)
    .trim();
}

function buildPrompt(repo: RepoSummary, readme: string, samples: RepoFileSample[]): string {
  const compactSamples = samples
    .map((sample, idx) => `FILE ${idx + 1}: ${sample.path}\n${pickExcerpt(sample.content, 2200)}`)
    .join('\n\n---\n\n');

  return `Extract distilled engineering knowledge from this repository.

REPO: ${repo.fullName}
DESCRIPTION: ${repo.description || '(none)'}
PRIMARY_LANGUAGE: ${repo.language || '(unknown)'}
TOPICS: ${(repo.topics || []).join(', ') || '(none)'}

README_EXCERPT:
${pickExcerpt(readme, 2800)}

CODE_SAMPLES:
${compactSamples}

Rules:
1) Produce distilled understanding, not raw code blocks.
2) Keep each insight specific and actionable.
3) Focus on architecture patterns, API/interface design, algorithms/techniques, documentation practices, and tooling/build/CI setup.
4) Do not invent facts not supported by provided content.
5) Keep each insight under 220 characters.

Return ONLY valid JSON with this exact structure:
{
  "architecture": [{"insight":"...", "confidence":0.0-1.0, "tags":["..."]}],
  "apiSurfaces": [{"insight":"...", "confidence":0.0-1.0, "tags":["..."]}],
  "techniques": [{"insight":"...", "confidence":0.0-1.0, "tags":["..."]}],
  "documentation": [{"insight":"...", "confidence":0.0-1.0, "tags":["..."]}],
  "tooling": [{"insight":"...", "confidence":0.0-1.0, "tags":["..."]}]
}`;
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>;
}

function parsePayload(json: Record<string, unknown> | null): LlmExtractionPayload {
  return {
    architecture: asArray(json?.architecture).map((entry) => ({
      insight: String(entry.insight || ''),
      confidence: Number(entry.confidence),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    })),
    apiSurfaces: asArray(json?.apiSurfaces).map((entry) => ({
      insight: String(entry.insight || ''),
      confidence: Number(entry.confidence),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    })),
    techniques: asArray(json?.techniques).map((entry) => ({
      insight: String(entry.insight || ''),
      confidence: Number(entry.confidence),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    })),
    documentation: asArray(json?.documentation).map((entry) => ({
      insight: String(entry.insight || ''),
      confidence: Number(entry.confidence),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    })),
    tooling: asArray(json?.tooling).map((entry) => ({
      insight: String(entry.insight || ''),
      confidence: Number(entry.confidence),
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    })),
  };
}

function pushEntry(
  target: KnowledgeEntry[],
  repo: RepoSummary,
  type: KnowledgeEntryType,
  insight: string,
  confidence: number,
  tags: string[],
) {
  const content = cleanInsight(insight);
  if (!content || content.length < 18) return;
  target.push({
    id: uid('repo_knowledge'),
    content,
    type,
    source: `repo:${repo.fullName}`,
    confidence: clamp01(confidence),
    tags: normalizeTags(tags, ['repo-ingestor', type, repo.owner.toLowerCase(), repo.name.toLowerCase()]),
  });
}

function dedupeEntries(entries: KnowledgeEntry[]): KnowledgeEntry[] {
  const seen = new Set<string>();
  const unique: KnowledgeEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.type}:${entry.content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

function buildHeuristicFallback(repo: RepoSummary, readme: string, samples: RepoFileSample[]): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const loweredReadme = readme.toLowerCase();
  const filePaths = samples.map((sample) => sample.path.toLowerCase());

  if (filePaths.some((p) => p.includes('dockerfile') || p.includes('docker-compose'))) {
    pushEntry(entries, repo, 'tooling', 'Containerized workflow is used to standardize runtime/deployment.', 0.66, [
      'docker',
    ]);
  }
  if (filePaths.some((p) => p.endsWith('package.json'))) {
    pushEntry(entries, repo, 'tooling', 'Node package tooling is present with script-driven automation.', 0.64, [
      'node',
      'package-management',
    ]);
  }
  if (filePaths.some((p) => p.endsWith('pyproject.toml') || p.endsWith('requirements.txt'))) {
    pushEntry(entries, repo, 'tooling', 'Python dependency management is explicitly configured.', 0.64, [
      'python',
      'dependencies',
    ]);
  }
  if (filePaths.some((p) => /\.test\./.test(p) || /\.spec\./.test(p) || p.includes('/tests/'))) {
    pushEntry(entries, repo, 'documentation', 'Testing artifacts suggest quality validation discipline.', 0.62, [
      'testing',
    ]);
  }
  if (loweredReadme.includes('architecture') || loweredReadme.includes('design')) {
    pushEntry(entries, repo, 'architecture', 'README includes explicit architecture-level explanation.', 0.6, [
      'readme',
      'architecture',
    ]);
  }

  return entries;
}

export async function extractRepoKnowledge(
  input: RepoKnowledgeExtractionInput,
): Promise<RepoKnowledgeExtractionResult> {
  const repo = input.repo;
  const maxEntries = Math.max(4, Math.min(80, Number(input.maxEntries || DEFAULT_MAX_ENTRIES)));
  const warnings: string[] = [];
  const readme = String(input.readmeContent || '').trim();
  const samples = input.sampledFiles || [];

  const fallback = buildHeuristicFallback(repo, readme, samples);
  if (!input.generate) {
    warnings.push('LLM unavailable; used heuristic extraction fallback only.');
    return {
      entries: dedupeEntries(fallback).slice(0, maxEntries),
      warnings,
    };
  }

  if (!readme && samples.length === 0) {
    return {
      entries: [],
      warnings: ['No repository content provided for extraction.'],
    };
  }

  try {
    const prompt = buildPrompt(repo, readme || '(README unavailable)', samples);
    const response = await input.generate(
      [
        {
          role: 'system',
          content: 'You distill software engineering knowledge from repository evidence. Output JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2, maxTokens: 1200 },
    );

    const parsed = parseJsonObject(response);
    const payload = parsePayload(parsed);

    const entries: KnowledgeEntry[] = [];
    payload.architecture.forEach((item) =>
      pushEntry(
        entries,
        repo,
        'architecture',
        item.insight,
        Number(item.confidence ?? 0.72),
        item.tags || ['architecture'],
      ),
    );
    payload.apiSurfaces.forEach((item) =>
      pushEntry(entries, repo, 'api', item.insight, Number(item.confidence ?? 0.7), item.tags || ['api']),
    );
    payload.techniques.forEach((item) =>
      pushEntry(entries, repo, 'technique', item.insight, Number(item.confidence ?? 0.7), item.tags || ['technique']),
    );
    payload.documentation.forEach((item) =>
      pushEntry(entries, repo, 'documentation', item.insight, Number(item.confidence ?? 0.65), item.tags || ['docs']),
    );
    payload.tooling.forEach((item) =>
      pushEntry(entries, repo, 'tooling', item.insight, Number(item.confidence ?? 0.67), item.tags || ['tooling']),
    );

    const merged = dedupeEntries([...entries, ...fallback]).slice(0, maxEntries);
    if (entries.length === 0) {
      warnings.push('LLM output did not yield structured insights; fallback heuristics were used.');
    }

    return { entries: merged, warnings };
  } catch (e) {
    warnings.push(`LLM extraction failed: ${e instanceof Error ? e.message : String(e)}`);
    return {
      entries: dedupeEntries(fallback).slice(0, maxEntries),
      warnings,
    };
  }
}
