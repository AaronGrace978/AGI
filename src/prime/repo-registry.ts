export interface CuratedTopic {
  id: string;
  label: string;
  queryTerms: string[];
  description: string;
}

export interface CuratedSeedRepo {
  fullName: string; // owner/repo
  reason: string;
  tags: string[];
  preferred?: boolean;
}

export interface RepoSearchOptions {
  minStars?: number;
  language?: string;
  includeForks?: boolean;
  maxQueries?: number;
}

const DEFAULT_MIN_STARS = 500;
const DEFAULT_MAX_QUERIES = 8;

export const CURATED_AGI_TOPICS: CuratedTopic[] = [
  {
    id: 'llm_architecture',
    label: 'LLM Architectures',
    description: 'Transformer internals, inference kernels, and model architecture implementations.',
    queryTerms: [
      'transformer architecture implementation',
      'llm inference engine',
      'mixture of experts transformer',
      'attention optimization',
    ],
  },
  {
    id: 'agent_frameworks',
    label: 'Agent Frameworks',
    description: 'Tool-using agents, planning loops, memory-augmented orchestration systems.',
    queryTerms: [
      'agent framework planning memory',
      'autonomous llm agent tools',
      'multi agent orchestration',
      'reasoning and acting agent',
    ],
  },
  {
    id: 'reasoning_systems',
    label: 'Reasoning Systems',
    description: 'Deliberate reasoning, symbolic integration, search-guided inference.',
    queryTerms: [
      'llm reasoning engine',
      'neuro symbolic reasoning',
      'tree search language model',
      'program synthesis reasoning',
    ],
  },
  {
    id: 'reinforcement_learning',
    label: 'Reinforcement Learning',
    description: 'Policy optimization, world models, planning in latent/action spaces.',
    queryTerms: [
      'reinforcement learning library',
      'model based reinforcement learning',
      'policy gradient implementation',
      'offline reinforcement learning',
    ],
  },
  {
    id: 'multimodal_systems',
    label: 'Multimodal Systems',
    description: 'Vision-language, speech-language, and unified multimodal pipelines.',
    queryTerms: [
      'vision language model framework',
      'multimodal transformer',
      'speech language model',
      'image text reasoning',
    ],
  },
  {
    id: 'vector_memory_rag',
    label: 'Vector Memory and RAG',
    description: 'Embeddings, retrieval, chunking, reranking, and memory retrieval pipelines.',
    queryTerms: [
      'vector database embeddings retrieval',
      'rag pipeline implementation',
      'semantic search memory',
      'retrieval augmented generation framework',
    ],
  },
  {
    id: 'safety_alignment',
    label: 'Safety and Alignment',
    description: 'Guardrails, evaluation harnesses, reward modeling, and reliability controls.',
    queryTerms: [
      'llm safety evaluation framework',
      'alignment benchmark harness',
      'model robustness testing',
      'ai guardrails open source',
    ],
  },
  {
    id: 'systems_infra',
    label: 'AI Systems Infrastructure',
    description: 'High-performance infrastructure for serving, compiling, and optimizing models.',
    queryTerms: [
      'gpu inference serving',
      'llm runtime compiler',
      'distributed training infrastructure',
      'ai systems optimization',
    ],
  },
];

export const CURATED_SEED_REPOS: CuratedSeedRepo[] = [
  {
    fullName: 'pytorch/pytorch',
    reason: 'Large-scale production ML engineering patterns.',
    tags: ['ml', 'python', 'systems'],
    preferred: true,
  },
  {
    fullName: 'huggingface/transformers',
    reason: 'Model architecture implementations and API design.',
    tags: ['llm', 'transformers', 'python'],
    preferred: true,
  },
  {
    fullName: 'vllm-project/vllm',
    reason: 'High-quality inference serving architecture.',
    tags: ['inference', 'systems', 'python'],
    preferred: true,
  },
  {
    fullName: 'openai/triton',
    reason: 'Kernel-level optimization patterns for model compute.',
    tags: ['compiler', 'gpu', 'python'],
  },
  {
    fullName: 'ray-project/ray',
    reason: 'Distributed execution and scheduling patterns.',
    tags: ['distributed', 'python', 'infrastructure'],
  },
  {
    fullName: 'langchain-ai/langchain',
    reason: 'Agent/tool orchestration and chain design patterns.',
    tags: ['agents', 'orchestration', 'python'],
  },
  {
    fullName: 'microsoft/Autogen',
    reason: 'Multi-agent communication patterns.',
    tags: ['agents', 'coordination', 'python'],
  },
  {
    fullName: 'tensorflow/tensorflow',
    reason: 'Production-grade ML framework architecture.',
    tags: ['ml', 'systems', 'cpp'],
  },
  {
    fullName: 'scikit-learn/scikit-learn',
    reason: 'Readable algorithm implementations and API consistency.',
    tags: ['ml', 'api-design', 'python'],
  },
  {
    fullName: 'ggerganov/llama.cpp',
    reason: 'Efficient low-level model runtime implementation.',
    tags: ['inference', 'cpp', 'optimization'],
    preferred: true,
  },
];

const BLOCKED_OWNERS = new Set(['awesome-selfhosted', 'freecodecamp', 'codecrafters-io']);

const BLOCKED_REPO_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^awesome[-_]/i, reason: 'Aggregator list repo, not primary implementation source.' },
  {
    pattern: /[-_](tutorial|course|bootcamp|roadmap)$/i,
    reason: 'Educational/tutor-style repo, not production implementation.',
  },
  {
    pattern: /(^|[-_])(cheatsheet|cheat-sheet|notes)([-_]|$)/i,
    reason: 'Reference notes repo, not code architecture source.',
  },
  {
    pattern: /(^|[-_])from[-_]scratch$/i,
    reason: 'Didactic implementation likely optimized for teaching over production quality.',
  },
  { pattern: /(^|[-_])100[-_]?days/i, reason: 'Challenge-series repo, quality signal is inconsistent.' },
];

export function normalizeFullName(owner: string, repo: string): string {
  return `${String(owner || '')
    .trim()
    .toLowerCase()}/${String(repo || '')
    .trim()
    .toLowerCase()}`;
}

export function parseFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = String(fullName || '')
    .trim()
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  return { owner: owner || '', repo: repo || '' };
}

function resolveTopic(topicInput: string): CuratedTopic | null {
  const normalized = topicInput.trim().toLowerCase();
  if (!normalized) return null;
  return (
    CURATED_AGI_TOPICS.find((topic) => topic.id === normalized) ||
    CURATED_AGI_TOPICS.find((topic) => topic.label.toLowerCase() === normalized) ||
    CURATED_AGI_TOPICS.find((topic) => topic.label.toLowerCase().includes(normalized)) ||
    null
  );
}

export function getSearchQueries(topicInput: string, options: RepoSearchOptions = {}): string[] {
  const topic = resolveTopic(topicInput);
  const minStars = Number.isFinite(Number(options.minStars))
    ? Math.max(0, Math.floor(Number(options.minStars)))
    : DEFAULT_MIN_STARS;
  const includeForks = options.includeForks === true;
  const maxQueries = Number.isFinite(Number(options.maxQueries))
    ? Math.max(1, Math.min(24, Math.floor(Number(options.maxQueries))))
    : DEFAULT_MAX_QUERIES;
  const language = String(options.language || '')
    .trim()
    .toLowerCase();

  const baseTerms = topic?.queryTerms?.length
    ? topic.queryTerms
    : ['artificial general intelligence', 'autonomous agent framework', 'llm reasoning system'];

  const qualifiers = [`stars:>=${minStars}`];
  if (!includeForks) qualifiers.push('fork:false');
  if (language) qualifiers.push(`language:${language}`);

  const queries = baseTerms.map((term) => `${term} ${qualifiers.join(' ')}`.trim());
  return [...new Set(queries)].slice(0, maxQueries);
}

export function getCuratedTopics(): CuratedTopic[] {
  return [...CURATED_AGI_TOPICS];
}

export function getCuratedSeedRepos(): CuratedSeedRepo[] {
  return [...CURATED_SEED_REPOS];
}

export function isCuratedSeedRepo(owner: string, repo: string): boolean {
  const normalized = normalizeFullName(owner, repo);
  return CURATED_SEED_REPOS.some((entry) => entry.fullName.toLowerCase() === normalized);
}

export function isBlockedRepo(owner: string, repo: string): { blocked: boolean; reason: string | null } {
  const ownerNorm = String(owner || '')
    .trim()
    .toLowerCase();
  const repoNorm = String(repo || '')
    .trim()
    .toLowerCase();

  if (!ownerNorm || !repoNorm) {
    return { blocked: true, reason: 'Missing owner/repo identity.' };
  }

  if (BLOCKED_OWNERS.has(ownerNorm)) {
    return { blocked: true, reason: `Owner "${ownerNorm}" is blocked by source policy.` };
  }

  for (const entry of BLOCKED_REPO_PATTERNS) {
    if (entry.pattern.test(repoNorm)) {
      return { blocked: true, reason: entry.reason };
    }
  }

  return { blocked: false, reason: null };
}

export function buildTopicSearchPlan(
  topicInput: string,
  options: RepoSearchOptions = {},
): {
  topic: CuratedTopic | null;
  queries: string[];
} {
  return {
    topic: resolveTopic(topicInput),
    queries: getSearchQueries(topicInput, options),
  };
}
