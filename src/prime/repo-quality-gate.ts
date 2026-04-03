import type { GenerateFn } from './runtime';

export interface RepoSummary {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  language: string;
  topics: string[];
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  size: number;
  license: string | null;
}

export interface RepoTreeEntry {
  path: string;
  type: 'blob' | 'tree' | string;
  size: number;
  mode?: string;
  sha?: string;
}

export type RepoGateName = 'metadata' | 'structural' | 'llm';

export interface GateResult {
  gate: RepoGateName;
  passed: boolean;
  score: number; // 0..1
  reasons: string[];
  checksPassed: number;
  checksTotal: number;
  details: Record<string, unknown>;
  skipped?: boolean;
}

export interface RepoQualityConfig {
  minStars: number;
  minRepoAgeDays: number;
  maxStaleDays: number;
  minFileCount: number;
  maxFileCount: number;
  requireLicense: boolean;
  requireTests: boolean;
  requireCi: boolean;
  requireSourceDir: boolean;
  rejectForks: boolean;
  requirePrimaryLanguage: boolean;
  llmReviewRequired: boolean;
  llmScoreThreshold: number;
  llmSampleFileCount: number;
  llmMaxCharsPerFile: number;
}

export interface RepoQualityReport {
  passed: boolean;
  overallScore: number; // 0..1
  metadata: GateResult;
  structural: GateResult;
  llm: GateResult;
  sampledFiles: string[];
}

export interface RepoQualityRunInput {
  repo: RepoSummary;
  tree: RepoTreeEntry[];
  readmeContent?: string | null;
  fetchFileContent: (filePath: string, ref?: string) => Promise<string | null>;
  generate?: GenerateFn;
  config?: Partial<RepoQualityConfig>;
  nowMs?: number;
}

interface LlmReviewResult {
  overall: number;
  readability: number;
  architecture: number;
  errorHandling: number;
  typeSafety: number;
  naming: number;
  reasons: string[];
}

const DEFAULT_CONFIG: RepoQualityConfig = {
  minStars: 500,
  minRepoAgeDays: 180,
  maxStaleDays: 540, // ~18 months
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
};

const SOURCE_DIR_HINTS = ['src/', 'lib/', 'app/', 'packages/', 'core/', 'cmd/', 'server/', 'client/'];
const CI_FILE_HINTS = [
  '.github/workflows/',
  '.circleci/config.yml',
  '.gitlab-ci.yml',
  'azure-pipelines.yml',
  'Jenkinsfile',
];
const RED_FLAG_PATH_HINTS = ['node_modules/', 'vendor/', 'dist/', 'build/', '.venv/', '__pycache__/', '.pytest_cache/'];
const RED_FLAG_FILE_HINTS = ['id_rsa', '.env', '.pem', '.p12', '.key', 'credentials.json', 'secrets.json'];
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.cpp',
  '.cc',
  '.c',
  '.h',
  '.hpp',
  '.cs',
  '.rb',
  '.php',
]);

function normalizeConfig(partial?: Partial<RepoQualityConfig>): RepoQualityConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(partial || {}),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function daysBetween(fromIso: string | null, nowMs: number): number | null {
  if (!fromIso) return null;
  const ts = Date.parse(fromIso);
  if (!Number.isFinite(ts)) return null;
  return Math.floor((nowMs - ts) / (24 * 60 * 60 * 1000));
}

function normalizePath(inputPath: string): string {
  return String(inputPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function fileExt(inputPath: string): string {
  const p = normalizePath(inputPath);
  const dot = p.lastIndexOf('.');
  return dot >= 0 ? p.slice(dot) : '';
}

function hasSubstantiveReadme(readmeContent: string | null | undefined): boolean {
  if (!readmeContent) return false;
  const stripped = readmeContent
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/[#>*_()-]/g, ' ')
    .replace(/\[/g, ' ')
    .replace(/\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(' ').filter(Boolean);
  return words.length >= 80;
}

function createResult(
  gate: RepoGateName,
  checksTotal: number,
  checksPassed: number,
  reasons: string[],
  details: Record<string, unknown>,
  skipped: boolean = false,
): GateResult {
  const score = checksTotal > 0 ? clamp01(checksPassed / checksTotal) : 0;
  return {
    gate,
    passed: !skipped && reasons.length === 0,
    score,
    reasons,
    checksPassed,
    checksTotal,
    details,
    skipped,
  };
}

export function runMetadataGate(
  repo: RepoSummary,
  config?: Partial<RepoQualityConfig>,
  nowMs: number = Date.now(),
): GateResult {
  const cfg = normalizeConfig(config);
  const reasons: string[] = [];
  let passedChecks = 0;
  const checksTotal = 8;

  if (repo.stars >= cfg.minStars) passedChecks += 1;
  else reasons.push(`Stars below threshold (${repo.stars} < ${cfg.minStars}).`);

  if (!repo.archived && !repo.disabled) passedChecks += 1;
  else reasons.push('Repository is archived or disabled.');

  if (!cfg.rejectForks || !repo.fork) passedChecks += 1;
  else reasons.push('Repository is a fork (requires original source repo).');

  const ageDays = daysBetween(repo.createdAt, nowMs);
  if (ageDays !== null && ageDays >= cfg.minRepoAgeDays) passedChecks += 1;
  else reasons.push(`Repository too new (${ageDays ?? 'unknown'} days < ${cfg.minRepoAgeDays}).`);

  const staleDays = daysBetween(repo.pushedAt || repo.updatedAt, nowMs);
  if (staleDays !== null && staleDays <= cfg.maxStaleDays) passedChecks += 1;
  else reasons.push(`Repository appears stale (${staleDays ?? 'unknown'} days > ${cfg.maxStaleDays}).`);

  if (!cfg.requireLicense || Boolean(repo.license)) passedChecks += 1;
  else reasons.push('Repository has no clear open-source license.');

  if (!cfg.requirePrimaryLanguage || Boolean(repo.language)) passedChecks += 1;
  else reasons.push('Primary language is missing.');

  // Safety signal: very large issue queue can indicate maintenance strain.
  const issueRatio = repo.stars > 0 ? repo.openIssues / repo.stars : 1;
  if (issueRatio <= 0.2) passedChecks += 1;
  else reasons.push(`Issue pressure too high (${repo.openIssues} open issues vs ${repo.stars} stars).`);

  return createResult('metadata', checksTotal, passedChecks, reasons, {
    stars: repo.stars,
    minStars: cfg.minStars,
    ageDays,
    minRepoAgeDays: cfg.minRepoAgeDays,
    staleDays,
    maxStaleDays: cfg.maxStaleDays,
    issueRatio: Number(issueRatio.toFixed(3)),
    license: repo.license,
    language: repo.language,
    archived: repo.archived,
    disabled: repo.disabled,
    fork: repo.fork,
  });
}

function inspectStructure(tree: RepoTreeEntry[]) {
  const blobs = tree.filter((item) => item.type === 'blob');
  const dirs = tree.filter((item) => item.type === 'tree');
  const paths = blobs.map((item) => normalizePath(item.path));

  const hasReadme = paths.some((p) => p === 'readme.md' || p.endsWith('/readme.md'));
  const hasSourceDir = paths.some((p) => SOURCE_DIR_HINTS.some((hint) => p.startsWith(hint) || p.includes(`/${hint}`)));
  const hasTests = paths.some(
    (p) => /(^|\/)(__tests__|test|tests)(\/|$)/.test(p) || /\.test\.[a-z0-9]+$/.test(p) || /\.spec\.[a-z0-9]+$/.test(p),
  );
  const hasCi = paths.some((p) =>
    CI_FILE_HINTS.some((hint) => p === hint || p.startsWith(hint) || p.includes(`/${hint}`)),
  );

  const redFlags = paths.filter((p) => {
    if (RED_FLAG_PATH_HINTS.some((hint) => p.includes(hint))) return true;
    const leaf = p.split('/').pop() || '';
    if (leaf === '.env.example' || leaf === '.env.sample') return false;
    return RED_FLAG_FILE_HINTS.some((hint) => leaf === hint || leaf.endsWith(hint));
  });

  return {
    fileCount: blobs.length,
    dirCount: dirs.length,
    hasReadme,
    hasSourceDir,
    hasTests,
    hasCi,
    redFlags: redFlags.slice(0, 20),
    paths,
  };
}

function filePriority(pathValue: string): number {
  const path = normalizePath(pathValue);
  let score = 0;
  if (path.startsWith('src/')) score += 4;
  if (path.startsWith('lib/')) score += 3;
  if (path.includes('/core/')) score += 2;
  if (path.includes('/service')) score += 1;
  if (/index\.[a-z0-9]+$/.test(path)) score -= 0.2;
  if (/\.d\.ts$/.test(path)) score -= 1.5;
  if (/min\.[a-z0-9]+$/.test(path)) score -= 2;
  if (/\/(dist|build|vendor|node_modules|coverage)\//.test(path)) score -= 4;
  return score;
}

function pickRepresentativeFiles(tree: RepoTreeEntry[], maxCount: number): string[] {
  const candidates = tree
    .filter((item) => item.type === 'blob')
    .map((item) => ({ path: normalizePath(item.path), size: Number(item.size || 0) }))
    .filter((item) => CODE_EXTENSIONS.has(fileExt(item.path)))
    .filter((item) => item.size >= 120 && item.size <= 180_000)
    .filter((item) => !/\/(dist|build|vendor|node_modules|coverage|__pycache__)\//.test(item.path))
    .filter((item) => !/\.min\./.test(item.path))
    .map((item) => ({ ...item, priority: filePriority(item.path) }))
    .sort((a, b) => b.priority - a.priority || a.size - b.size);

  const picked: string[] = [];
  for (const c of candidates) {
    if (picked.length >= maxCount) break;
    picked.push(c.path);
  }
  return picked;
}

export function runStructuralGate(
  tree: RepoTreeEntry[],
  readmeContent: string | null | undefined,
  config?: Partial<RepoQualityConfig>,
): { result: GateResult; sampledFiles: string[] } {
  const cfg = normalizeConfig(config);
  const structure = inspectStructure(tree);
  const reasons: string[] = [];
  let passedChecks = 0;
  const checksTotal = 7;

  if (structure.hasReadme && hasSubstantiveReadme(readmeContent)) passedChecks += 1;
  else reasons.push('README is missing or not substantive enough.');

  if (!cfg.requireSourceDir || structure.hasSourceDir) passedChecks += 1;
  else reasons.push('Repository does not have a clear source directory structure.');

  if (!cfg.requireTests || structure.hasTests) passedChecks += 1;
  else reasons.push('Repository does not appear to include tests.');

  if (!cfg.requireCi || structure.hasCi) passedChecks += 1;
  else reasons.push('Repository is missing CI workflow configuration.');

  if (structure.fileCount >= cfg.minFileCount) passedChecks += 1;
  else reasons.push(`Repository is too small (${structure.fileCount} files < ${cfg.minFileCount}).`);

  if (structure.fileCount <= cfg.maxFileCount) passedChecks += 1;
  else reasons.push(`Repository is too large/noisy (${structure.fileCount} files > ${cfg.maxFileCount}).`);

  if (structure.redFlags.length === 0) passedChecks += 1;
  else reasons.push(`Structural red flags detected (${structure.redFlags.slice(0, 3).join(', ')}).`);

  const sampledFiles = pickRepresentativeFiles(tree, cfg.llmSampleFileCount);
  const result = createResult('structural', checksTotal, passedChecks, reasons, {
    fileCount: structure.fileCount,
    dirCount: structure.dirCount,
    hasReadme: structure.hasReadme,
    hasSourceDir: structure.hasSourceDir,
    hasTests: structure.hasTests,
    hasCi: structure.hasCi,
    redFlags: structure.redFlags,
    sampledFiles,
  });

  return { result, sampledFiles };
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

async function runLlmReview(
  repo: RepoSummary,
  samples: Array<{ path: string; content: string }>,
  generate: GenerateFn,
): Promise<LlmReviewResult | null> {
  const packedSamples = samples
    .map((sample, idx) => `FILE ${idx + 1}: ${sample.path}\n${sample.content}`)
    .join('\n\n---\n\n');

  const prompt = `Review this repository code sample as a strict quality gate.

REPOSITORY: ${repo.fullName}
DESCRIPTION: ${repo.description || '(none)'}
LANGUAGE: ${repo.language || '(unknown)'}

Evaluate only code quality and engineering rigor from provided files.

SAMPLES:
${packedSamples}

Return ONLY valid JSON:
{
  "overall": 0.0-1.0,
  "readability": 0.0-1.0,
  "architecture": 0.0-1.0,
  "errorHandling": 0.0-1.0,
  "typeSafety": 0.0-1.0,
  "naming": 0.0-1.0,
  "reasons": ["short reason 1", "short reason 2", "short reason 3"]
}

Scoring guidance:
- 0.85+ exceptionally high quality
- 0.70+ good production quality
- 0.50-0.69 mixed quality
- <0.50 weak quality`;

  const response = await generate(
    [
      {
        role: 'system',
        content: 'You are a strict software quality reviewer. Output valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    { temperature: 0.1, maxTokens: 700 },
  );

  const parsed = parseJsonObject(response);
  if (!parsed) return null;

  return {
    overall: clamp01(Number(parsed.overall || 0)),
    readability: clamp01(Number(parsed.readability || 0)),
    architecture: clamp01(Number(parsed.architecture || 0)),
    errorHandling: clamp01(Number(parsed.errorHandling || 0)),
    typeSafety: clamp01(Number(parsed.typeSafety || 0)),
    naming: clamp01(Number(parsed.naming || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 8) : [],
  };
}

export async function runLlmGate(
  repo: RepoSummary,
  sampledFiles: string[],
  fetchFileContent: (filePath: string, ref?: string) => Promise<string | null>,
  generate: GenerateFn | undefined,
  config?: Partial<RepoQualityConfig>,
): Promise<GateResult> {
  const cfg = normalizeConfig(config);

  if (!cfg.llmReviewRequired) {
    return {
      gate: 'llm',
      passed: true,
      score: 1,
      reasons: [],
      checksPassed: 1,
      checksTotal: 1,
      details: { llmReviewRequired: false },
      skipped: true,
    };
  }

  if (!generate) {
    return createResult('llm', 1, 0, ['LLM review unavailable (no generation function).'], { sampledFiles }, false);
  }

  if (sampledFiles.length === 0) {
    return createResult('llm', 1, 0, ['No representative source files available for LLM review.'], {}, false);
  }

  const samples: Array<{ path: string; content: string }> = [];
  for (const filePath of sampledFiles) {
    const text = await fetchFileContent(filePath, repo.defaultBranch || 'main');
    if (!text) continue;
    const cleaned = text.replace(/\r\n/g, '\n').slice(0, cfg.llmMaxCharsPerFile).trim();
    if (cleaned.length < 100) continue;
    samples.push({ path: filePath, content: cleaned });
  }

  if (samples.length === 0) {
    return createResult('llm', 1, 0, ['Unable to load usable source samples for LLM review.'], { sampledFiles }, false);
  }

  try {
    const llm = await runLlmReview(repo, samples, generate);
    if (!llm) {
      return createResult('llm', 1, 0, ['LLM review response could not be parsed.'], { sampledFiles }, false);
    }
    const passed = llm.overall >= cfg.llmScoreThreshold;
    return {
      gate: 'llm',
      passed,
      score: llm.overall,
      reasons: passed
        ? []
        : [
            `LLM quality score below threshold (${llm.overall.toFixed(2)} < ${cfg.llmScoreThreshold.toFixed(2)}).`,
            ...llm.reasons,
          ],
      checksPassed: passed ? 1 : 0,
      checksTotal: 1,
      details: {
        sampledFiles: samples.map((s) => s.path),
        threshold: cfg.llmScoreThreshold,
        ...llm,
      },
    };
  } catch (e) {
    return createResult('llm', 1, 0, [`LLM review failed: ${e instanceof Error ? e.message : String(e)}`], {}, false);
  }
}

export async function runRepoQualityGates(input: RepoQualityRunInput): Promise<RepoQualityReport> {
  const cfg = normalizeConfig(input.config);
  const now = input.nowMs ?? Date.now();

  const metadata = runMetadataGate(input.repo, cfg, now);
  const { result: structural, sampledFiles } = runStructuralGate(input.tree, input.readmeContent, cfg);

  let llm: GateResult;
  if (!metadata.passed || !structural.passed) {
    llm = createResult(
      'llm',
      1,
      0,
      ['Skipped because metadata/structural gates did not pass.'],
      {
        skippedDueTo: [!metadata.passed ? 'metadata' : null, !structural.passed ? 'structural' : null].filter(Boolean),
      },
      true,
    );
  } else {
    llm = await runLlmGate(input.repo, sampledFiles, input.fetchFileContent, input.generate, cfg);
  }

  const overallScore = clamp01(metadata.score * 0.35 + structural.score * 0.3 + llm.score * 0.35);
  const passed = metadata.passed && structural.passed && llm.passed;

  return {
    passed,
    overallScore,
    metadata,
    structural,
    llm,
    sampledFiles,
  };
}
