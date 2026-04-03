import type { GenerateFn } from './runtime';
import { storeMemory, searchMemories } from './memory';
import { extractRepoKnowledge, type KnowledgeEntry } from './repo-knowledge-extractor';
import {
  runRepoQualityGates,
  type RepoQualityConfig,
  type RepoQualityReport,
  type RepoSummary,
} from './repo-quality-gate';
import { buildTopicSearchPlan, getCuratedSeedRepos, isBlockedRepo, parseFullName } from './repo-registry';

export interface RepoCandidate {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number;
  language: string;
  defaultBranch: string;
  sourceQuery?: string;
}

export type RepoIngestStage =
  | 'discover'
  | 'metadata'
  | 'structural'
  | 'quality'
  | 'extract'
  | 'store'
  | 'export'
  | 'complete'
  | 'error';

export interface RepoIngestProgress {
  stage: RepoIngestStage;
  message: string;
  repoFullName?: string;
  stats?: Record<string, number | string>;
}

export interface RepoIngestConfig extends RepoQualityConfig {
  maxReposPerSession: number;
  discoveryQueriesLimit: number;
  discoveryPerQuery: number;
  includeCuratedSeeds: boolean;
  maxKnowledgeEntriesPerRepo: number;
  dedupeSimilarityThreshold: number;
  exportMemoryAfterIngest: boolean;
  gitCommitAndPush: boolean;
  gitRepoRoot: string;
}

export interface RepoIngestResult {
  success: boolean;
  repo: RepoSummary | null;
  quality: RepoQualityReport | null;
  accepted: boolean;
  blockedReason: string | null;
  knowledgeEntries: KnowledgeEntry[];
  storedMemories: number;
  dedupedMemories: number;
  memoryExportPath: string | null;
  gitCommitMessage: string | null;
  gitPushExecuted: boolean;
  gitPushError: string | null;
  log: string[];
  error?: string;
}

export interface RepoBatchIngestResult {
  total: number;
  accepted: number;
  rejected: number;
  storedMemories: number;
  dedupedMemories: number;
  results: RepoIngestResult[];
}

interface GitHubRepoFileResponse {
  success: boolean;
  path?: string;
  content?: string;
  binary?: boolean;
  error?: string;
}

interface AgentExecuteResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  code?: number;
}

interface GitPublishResult {
  commitMessage: string | null;
  pushed: boolean;
  error: string | null;
}

const DEFAULT_CONFIG: RepoIngestConfig = {
  minStars: 500,
  minRepoAgeDays: 180,
  maxStaleDays: 540,
  minFileCount: 20,
  maxFileCount: 25_000,
  requireLicense: true,
  requireTests: true,
  requireCi: true,
  requireSourceDir: true,
  rejectForks: true,
  requirePrimaryLanguage: true,
  llmReviewRequired: true,
  llmScoreThreshold: 0.7,
  llmSampleFileCount: 5,
  llmMaxCharsPerFile: 4000,
  maxReposPerSession: 5,
  discoveryQueriesLimit: 8,
  discoveryPerQuery: 20,
  includeCuratedSeeds: true,
  maxKnowledgeEntriesPerRepo: 24,
  dedupeSimilarityThreshold: 0.92,
  exportMemoryAfterIngest: true,
  gitCommitAndPush: false,
  gitRepoRoot: '.',
};

export function getDefaultRepoIngestConfig(): RepoIngestConfig {
  return { ...DEFAULT_CONFIG };
}

function normalizeConfig(partial?: Partial<RepoIngestConfig>): RepoIngestConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(partial || {}),
  };
}

function normalizeRepoSummary(input: any): RepoSummary {
  return {
    owner: String(input?.owner || '').trim(),
    name: String(input?.name || '').trim(),
    fullName: String(input?.fullName || `${input?.owner || ''}/${input?.name || ''}`).trim(),
    htmlUrl: String(input?.htmlUrl || ''),
    description: String(input?.description || ''),
    stars: Number(input?.stars || 0),
    forks: Number(input?.forks || 0),
    watchers: Number(input?.watchers || 0),
    openIssues: Number(input?.openIssues || 0),
    language: String(input?.language || ''),
    topics: Array.isArray(input?.topics) ? input.topics.map(String) : [],
    archived: Boolean(input?.archived),
    disabled: Boolean(input?.disabled),
    fork: Boolean(input?.fork),
    defaultBranch: String(input?.defaultBranch || 'main'),
    pushedAt: input?.pushedAt || null,
    updatedAt: input?.updatedAt || null,
    createdAt: input?.createdAt || null,
    size: Number(input?.size || 0),
    license: input?.license ? String(input.license) : null,
  };
}

function asCandidate(input: any): RepoCandidate {
  return {
    owner: String(input?.owner || '').trim(),
    name: String(input?.name || '').trim(),
    fullName: String(input?.fullName || '').trim(),
    htmlUrl: String(input?.htmlUrl || input?.url || '').trim(),
    description: String(input?.description || ''),
    stars: Number(input?.stars || 0),
    language: String(input?.language || ''),
    defaultBranch: String(input?.defaultBranch || 'main'),
    sourceQuery: typeof input?.sourceQuery === 'string' ? input.sourceQuery : undefined,
  };
}

function parseRepoInput(input: string | RepoCandidate): { owner: string; repo: string } {
  if (typeof input !== 'string') {
    return { owner: input.owner, repo: input.name };
  }

  const trimmed = input.trim();
  if (!trimmed) return { owner: '', repo: '' };
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const parts = parsed.pathname.split('/').filter(Boolean);
      return { owner: parts[0] || '', repo: (parts[1] || '').replace(/\.git$/i, '') };
    } catch {
      return { owner: '', repo: '' };
    }
  }

  return parseFullName(trimmed);
}

function getGitHubApi() {
  return window.api?.github;
}

function getGenerateFn(): GenerateFn | undefined {
  if (!window.api?.llm?.generate) return undefined;
  return async (messages, config) => window.api.llm.generate(messages, config);
}

function pushLog(log: string[], message: string): void {
  log.push(message);
}

function emit(
  onProgress: ((event: RepoIngestProgress) => void) | undefined,
  stage: RepoIngestStage,
  message: string,
  repoFullName?: string,
  stats?: Record<string, number | string>,
): void {
  onProgress?.({ stage, message, repoFullName, stats });
}

async function fetchTextFile(owner: string, repo: string, filePath: string, ref: string): Promise<string | null> {
  const github = getGitHubApi();
  if (!github?.fetchFileContent) return null;
  const response = (await github.fetchFileContent({ owner, repo, path: filePath, ref })) as GitHubRepoFileResponse;
  if (!response?.success || response.binary || typeof response.content !== 'string') return null;
  return response.content;
}

async function fetchReadme(owner: string, repo: string, ref: string): Promise<string | null> {
  const candidates = ['README.md', 'readme.md', 'docs/README.md', 'README.MD'];
  for (const candidate of candidates) {
    const content = await fetchTextFile(owner, repo, candidate, ref);
    if (content) return content;
  }
  return null;
}

async function ensureRepoSummary(owner: string, repo: string): Promise<RepoSummary | null> {
  const github = getGitHubApi();
  if (!github?.fetchRepoMeta) return null;
  const meta = await github.fetchRepoMeta({ owner, repo });
  if (!meta?.success || !meta.repo) return null;
  return normalizeRepoSummary(meta.repo);
}

function sanitizeCommitMessage(input: string): string {
  return String(input || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/["`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function buildCommitMessage(repo: RepoSummary, quality: RepoQualityReport, extracted: number, stored: number): string {
  const score = (quality.overallScore * 100).toFixed(1);
  return sanitizeCommitMessage(
    `knowledge: ingest ${repo.fullName} | quality ${score}% | extracted ${extracted} | stored ${stored}`,
  );
}

function isWindowsHost(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = String((navigator as any).platform || '');
  const ua = String((navigator as any).userAgent || '');
  return /win/i.test(platform) || /windows/i.test(ua);
}

async function runAgentRepoCommand(repoRoot: string, command: string): Promise<AgentExecuteResult> {
  if (!window.api?.agent?.execute) {
    return { success: false, error: 'agent.execute unavailable' };
  }
  if (!repoRoot.trim()) {
    return { success: false, error: 'gitRepoRoot is empty' };
  }

  if (isWindowsHost()) {
    const escapedRoot = repoRoot.replace(/'/g, "''");
    const wrapped = `powershell -NoProfile -Command "Set-Location -LiteralPath '${escapedRoot}'; ${command}"`;
    return (await window.api.agent.execute(wrapped)) as AgentExecuteResult;
  }

  const escapedRoot = repoRoot.replace(/"/g, '\\"');
  const wrapped = `bash -lc "cd \\"${escapedRoot}\\" && ${command}"`;
  return (await window.api.agent.execute(wrapped)) as AgentExecuteResult;
}

async function publishKnowledgeToGit(
  repo: RepoSummary,
  quality: RepoQualityReport,
  extracted: number,
  stored: number,
  cfg: RepoIngestConfig,
): Promise<GitPublishResult> {
  const commitMessage = buildCommitMessage(repo, quality, extracted, stored);
  const escapedMessage = commitMessage.replace(/'/g, "''");

  const addResult = await runAgentRepoCommand(cfg.gitRepoRoot, "git add -- 'Memory/latest.json'");
  if (!addResult.success) {
    return {
      commitMessage,
      pushed: false,
      error: `git add failed: ${addResult.error || addResult.stderr || 'unknown error'}`,
    };
  }

  const stagedResult = await runAgentRepoCommand(
    cfg.gitRepoRoot,
    "git diff --cached --name-only -- 'Memory/latest.json'",
  );
  if (!stagedResult.success) {
    return {
      commitMessage,
      pushed: false,
      error: `Unable to inspect staged files: ${stagedResult.error || stagedResult.stderr || 'unknown error'}`,
    };
  }
  if (!String(stagedResult.stdout || '').trim()) {
    return {
      commitMessage,
      pushed: false,
      error: 'No staged changes detected for commit.',
    };
  }

  const commitResult = await runAgentRepoCommand(
    cfg.gitRepoRoot,
    `git commit -m '${escapedMessage}' -- 'Memory/latest.json'`,
  );
  if (!commitResult.success) {
    return {
      commitMessage,
      pushed: false,
      error: `git commit failed: ${commitResult.error || commitResult.stderr || 'unknown error'}`,
    };
  }

  const pushResult = await runAgentRepoCommand(cfg.gitRepoRoot, 'git push origin HEAD');
  if (!pushResult.success) {
    return {
      commitMessage,
      pushed: false,
      error: `git push failed: ${pushResult.error || pushResult.stderr || 'unknown error'}`,
    };
  }

  return {
    commitMessage,
    pushed: true,
    error: null,
  };
}

export async function discoverRepos(
  topic: string,
  config?: Partial<RepoIngestConfig>,
  onProgress?: (event: RepoIngestProgress) => void,
): Promise<RepoCandidate[]> {
  const cfg = normalizeConfig(config);
  const github = getGitHubApi();
  if (!github?.searchRepos) {
    emit(onProgress, 'error', 'GitHub search API is unavailable.');
    return [];
  }

  const plan = buildTopicSearchPlan(topic, {
    minStars: cfg.minStars,
    maxQueries: cfg.discoveryQueriesLimit,
  });
  const queries = plan.queries.slice(0, cfg.discoveryQueriesLimit);
  const dedup = new Map<string, RepoCandidate>();

  emit(onProgress, 'discover', `Running ${queries.length} discovery query(ies) for "${topic}".`);

  for (const query of queries) {
    const result = await github.searchRepos({
      query,
      minStars: cfg.minStars,
      perPage: cfg.discoveryPerQuery,
      sort: 'stars',
      order: 'desc',
    });
    if (!result?.success || !Array.isArray(result.items)) continue;

    for (const item of result.items) {
      const candidate = asCandidate({ ...item, sourceQuery: query });
      if (!candidate.fullName || !candidate.owner || !candidate.name) continue;
      const block = isBlockedRepo(candidate.owner, candidate.name);
      if (block.blocked) continue;

      const existing = dedup.get(candidate.fullName.toLowerCase());
      if (!existing || candidate.stars > existing.stars) {
        dedup.set(candidate.fullName.toLowerCase(), candidate);
      }
    }
  }

  if (cfg.includeCuratedSeeds) {
    for (const seed of getCuratedSeedRepos()) {
      const { owner, repo } = parseFullName(seed.fullName);
      if (!owner || !repo) continue;
      const key = `${owner}/${repo}`;
      if (dedup.has(key)) continue;
      dedup.set(key, {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
        htmlUrl: `https://github.com/${owner}/${repo}`,
        description: seed.reason,
        stars: 0,
        language: '',
        defaultBranch: 'main',
        sourceQuery: 'curated-seed',
      });
    }
  }

  const list = [...dedup.values()].sort((a, b) => b.stars - a.stars).slice(0, Math.max(cfg.maxReposPerSession * 4, 20));

  emit(onProgress, 'discover', `Discovered ${list.length} unique candidate repos.`);
  return list;
}

export async function ingestRepo(
  input: string | RepoCandidate,
  config?: Partial<RepoIngestConfig>,
  onProgress?: (event: RepoIngestProgress) => void,
): Promise<RepoIngestResult> {
  const cfg = normalizeConfig(config);
  const log: string[] = [];
  const github = getGitHubApi();

  const { owner, repo } = parseRepoInput(input);
  const fullName = `${owner}/${repo}`;
  if (!owner || !repo) {
    return {
      success: false,
      repo: null,
      quality: null,
      accepted: false,
      blockedReason: 'Invalid repository identifier.',
      knowledgeEntries: [],
      storedMemories: 0,
      dedupedMemories: 0,
      memoryExportPath: null,
      gitCommitMessage: null,
      gitPushExecuted: false,
      gitPushError: null,
      log: ['Invalid repository identifier.'],
      error: 'Invalid owner/repo',
    };
  }

  const block = isBlockedRepo(owner, repo);
  if (block.blocked) {
    return {
      success: true,
      repo: null,
      quality: null,
      accepted: false,
      blockedReason: block.reason,
      knowledgeEntries: [],
      storedMemories: 0,
      dedupedMemories: 0,
      memoryExportPath: null,
      gitCommitMessage: null,
      gitPushExecuted: false,
      gitPushError: null,
      log: [`Blocked by registry policy: ${block.reason}`],
    };
  }

  if (!github?.fetchRepoMeta || !github?.fetchRepoTree || !github?.fetchFileContent) {
    return {
      success: false,
      repo: null,
      quality: null,
      accepted: false,
      blockedReason: null,
      knowledgeEntries: [],
      storedMemories: 0,
      dedupedMemories: 0,
      memoryExportPath: null,
      gitCommitMessage: null,
      gitPushExecuted: false,
      gitPushError: null,
      log: ['GitHub IPC API unavailable in renderer.'],
      error: 'GitHub IPC unavailable',
    };
  }

  emit(onProgress, 'metadata', `Fetching metadata for ${fullName}...`, fullName);
  const summary = await ensureRepoSummary(owner, repo);
  if (!summary) {
    return {
      success: false,
      repo: null,
      quality: null,
      accepted: false,
      blockedReason: null,
      knowledgeEntries: [],
      storedMemories: 0,
      dedupedMemories: 0,
      memoryExportPath: null,
      gitCommitMessage: null,
      gitPushExecuted: false,
      gitPushError: null,
      log: ['Failed to fetch repo metadata.'],
      error: 'metadata fetch failed',
    };
  }
  pushLog(log, `Fetched metadata (${summary.stars} stars, ${summary.language || 'unknown language'}).`);

  emit(onProgress, 'structural', `Fetching tree for ${summary.fullName}...`, summary.fullName);
  const treeResponse = await github.fetchRepoTree({
    owner: summary.owner,
    repo: summary.name,
    ref: summary.defaultBranch,
    recursive: true,
  });
  if (!treeResponse?.success || !Array.isArray(treeResponse.tree)) {
    return {
      success: false,
      repo: summary,
      quality: null,
      accepted: false,
      blockedReason: null,
      knowledgeEntries: [],
      storedMemories: 0,
      dedupedMemories: 0,
      memoryExportPath: null,
      gitCommitMessage: null,
      gitPushExecuted: false,
      gitPushError: null,
      log: [...log, 'Failed to fetch repository tree.'],
      error: treeResponse?.error || 'tree fetch failed',
    };
  }

  const readmeContent = await fetchReadme(summary.owner, summary.name, summary.defaultBranch || 'main');
  pushLog(log, readmeContent ? 'README content loaded.' : 'README not found.');

  emit(onProgress, 'quality', `Running quality gates for ${summary.fullName}...`, summary.fullName);
  const quality = await runRepoQualityGates({
    repo: summary,
    tree: treeResponse.tree as any[],
    readmeContent,
    fetchFileContent: async (filePath, ref) =>
      await fetchTextFile(summary.owner, summary.name, filePath, ref || summary.defaultBranch || 'main'),
    generate: getGenerateFn(),
    config: cfg,
  });
  pushLog(log, `Quality score ${(quality.overallScore * 100).toFixed(1)}% (accepted=${quality.passed}).`);

  if (!quality.passed) {
    return {
      success: true,
      repo: summary,
      quality,
      accepted: false,
      blockedReason: null,
      knowledgeEntries: [],
      storedMemories: 0,
      dedupedMemories: 0,
      memoryExportPath: null,
      gitCommitMessage: null,
      gitPushExecuted: false,
      gitPushError: null,
      log: [...log, ...quality.metadata.reasons, ...quality.structural.reasons, ...quality.llm.reasons],
    };
  }

  emit(onProgress, 'extract', `Extracting distilled knowledge from ${summary.fullName}...`, summary.fullName);
  const samplePaths = quality.sampledFiles.slice(0, cfg.llmSampleFileCount);
  const sampleFiles: Array<{ path: string; content: string }> = [];
  for (const path of samplePaths) {
    const content = await fetchTextFile(summary.owner, summary.name, path, summary.defaultBranch || 'main');
    if (!content) continue;
    sampleFiles.push({ path, content: content.slice(0, cfg.llmMaxCharsPerFile) });
  }

  const extraction = await extractRepoKnowledge({
    repo: summary,
    readmeContent,
    sampledFiles: sampleFiles,
    generate: getGenerateFn(),
    maxEntries: cfg.maxKnowledgeEntriesPerRepo,
  });
  const knowledgeEntries = extraction.entries;
  extraction.warnings.forEach((warning) => pushLog(log, `[extractor] ${warning}`));
  pushLog(log, `Knowledge distilled: ${knowledgeEntries.length} entries.`);

  emit(onProgress, 'store', `Storing semantic knowledge from ${summary.fullName}...`, summary.fullName);
  let stored = 0;
  let deduped = 0;
  for (const entry of knowledgeEntries) {
    const matches = await searchMemories(entry.content, 3, 'semantic');
    const bestSimilarity = matches.length > 0 ? Math.max(...matches.map((match) => Number(match.similarity || 0))) : 0;
    if (bestSimilarity >= cfg.dedupeSimilarityThreshold) {
      deduped += 1;
      continue;
    }

    await storeMemory(entry.content, 'semantic', {
      source: 'repo-ingestor',
      importance: Math.max(0.55, Math.min(0.97, entry.confidence)),
      tags: [...entry.tags, `repo:${summary.fullName.toLowerCase()}`],
    });
    stored += 1;
  }
  pushLog(log, `Stored ${stored} memory entries (${deduped} deduped).`);

  let memoryExportPath: string | null = null;
  if (cfg.exportMemoryAfterIngest && stored > 0 && window.api?.memory?.export) {
    emit(onProgress, 'export', 'Exporting updated memory snapshot...', summary.fullName);
    const exportResult = await window.api.memory.export({ includeEmbeddings: true });
    if (exportResult?.success) {
      memoryExportPath = exportResult.path || null;
      pushLog(log, `Memory exported to ${memoryExportPath || '(default path)'}.`);
    } else {
      pushLog(log, `Memory export failed: ${String(exportResult?.error || 'unknown error')}`);
    }
  }

  let gitCommitMessage: string | null = null;
  let gitPushExecuted = false;
  let gitPushError: string | null = null;

  if (cfg.gitCommitAndPush && stored > 0) {
    emit(onProgress, 'export', 'Committing and pushing Memory/latest.json...', summary.fullName);
    const publish = await publishKnowledgeToGit(summary, quality, knowledgeEntries.length, stored, cfg);
    gitCommitMessage = publish.commitMessage;
    gitPushExecuted = publish.pushed;
    gitPushError = publish.error;

    if (publish.pushed) {
      pushLog(log, `Git push complete with commit: "${publish.commitMessage}".`);
    } else {
      pushLog(log, `Git publish skipped/failed: ${publish.error || 'unknown error'}`);
    }
  }

  emit(
    onProgress,
    'complete',
    `Ingestion complete for ${summary.fullName}. Stored ${stored} new memories.`,
    summary.fullName,
    { stored, deduped, extracted: knowledgeEntries.length },
  );

  return {
    success: true,
    repo: summary,
    quality,
    accepted: true,
    blockedReason: null,
    knowledgeEntries,
    storedMemories: stored,
    dedupedMemories: deduped,
    memoryExportPath,
    gitCommitMessage,
    gitPushExecuted,
    gitPushError,
    log,
  };
}

export async function ingestBatch(
  repos: Array<string | RepoCandidate>,
  config?: Partial<RepoIngestConfig>,
  onProgress?: (event: RepoIngestProgress) => void,
): Promise<RepoBatchIngestResult> {
  const cfg = normalizeConfig(config);
  const limited = repos.slice(0, cfg.maxReposPerSession);
  const results: RepoIngestResult[] = [];

  let accepted = 0;
  let rejected = 0;
  let storedMemories = 0;
  let dedupedMemories = 0;

  for (const repo of limited) {
    const result = await ingestRepo(repo, cfg, onProgress);
    results.push(result);
    if (result.accepted) accepted += 1;
    else rejected += 1;
    storedMemories += result.storedMemories;
    dedupedMemories += result.dedupedMemories;
  }

  return {
    total: results.length,
    accepted,
    rejected,
    storedMemories,
    dedupedMemories,
    results,
  };
}
