// ═══════════════════════════════════════════════════════════════
//  KNOWLEDGE SOURCES — Curated Truth Registry
//  Every source has a trust tier. Only verified, evidence-based
//  sources survive. No politics. No opinion. No bias. Just truth.
//
//  Tier 1: Peer-reviewed journals, government research agencies
//  Tier 2: University research departments, encyclopedias
//  Tier 3: Reputable science journalism with editorial standards
//  Blocked: News opinion, social media, political outlets, blogs
// ═══════════════════════════════════════════════════════════════

export type TrustTier = 1 | 2 | 3;

export interface KnowledgeSource {
  domain: string;
  name: string;
  tier: TrustTier;
  category: SourceCategory;
  searchTemplate?: string; // URL template with {query} placeholder
  rssUrl?: string;
}

export type SourceCategory =
  | 'journal'
  | 'preprint'
  | 'government'
  | 'university'
  | 'encyclopedia'
  | 'science-news'
  | 'technical';

// Domains that are ALWAYS blocked regardless of content
const BLOCKED_DOMAINS = new Set([
  // Political / opinion
  'foxnews.com',
  'msnbc.com',
  'cnn.com',
  'breitbart.com',
  'huffpost.com',
  'dailywire.com',
  'infowars.com',
  'oann.com',
  'newsmax.com',
  'thefederalist.com',
  'motherjones.com',
  'thedailybeast.com',
  'vox.com',
  'salon.com',
  'slate.com',

  // Tabloids / celebrity gossip
  'tmz.com',
  'dailymail.co.uk',
  'people.com',
  'usmagazine.com',
  'eonline.com',
  'pagesix.com',
  'buzzfeed.com',

  // Social media
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'threads.net',

  // Conspiracy / pseudoscience
  'naturalnews.com',
  'mercola.com',
  'globalresearch.ca',
  'prisonplanet.com',
  'stormfront.org',
  'davidicke.com',
  'activistpost.com',
  'zerohedge.com',

  // Unreliable / content farms
  'medium.com',
  'substack.com',
  'wordpress.com',
  'blogspot.com',
  'quora.com',
  'answers.yahoo.com',

  // Adult / gambling / malware
  'pornhub.com',
  'xvideos.com',
  'casino.com',
  'bet365.com',
]);

// URL patterns that indicate non-factual content
const BLOCKED_URL_PATTERNS = [
  /\/opinion\//i,
  /\/editorial\//i,
  /\/op-ed\//i,
  /\/blog\//i,
  /\/commentary\//i,
  /\/letters-to-the-editor/i,
  /\/politics\//i,
  /\/(porn|adult|nsfw|gambling|casino)/i,
];

// ─── Tier 1: Peer-Reviewed & Government Research ────────────
const TIER_1_SOURCES: KnowledgeSource[] = [
  // Preprint servers
  {
    domain: 'arxiv.org',
    name: 'arXiv',
    tier: 1,
    category: 'preprint',
    searchTemplate: 'https://arxiv.org/search/?query={query}&searchtype=all',
  },
  { domain: 'biorxiv.org', name: 'bioRxiv', tier: 1, category: 'preprint' },
  { domain: 'medrxiv.org', name: 'medRxiv', tier: 1, category: 'preprint' },
  { domain: 'chemrxiv.org', name: 'chemRxiv', tier: 1, category: 'preprint' },

  // Top journals
  { domain: 'nature.com', name: 'Nature', tier: 1, category: 'journal' },
  { domain: 'science.org', name: 'Science', tier: 1, category: 'journal' },
  { domain: 'cell.com', name: 'Cell', tier: 1, category: 'journal' },
  { domain: 'pnas.org', name: 'PNAS', tier: 1, category: 'journal' },
  { domain: 'nejm.org', name: 'NEJM', tier: 1, category: 'journal' },
  { domain: 'thelancet.com', name: 'The Lancet', tier: 1, category: 'journal' },
  { domain: 'bmj.com', name: 'BMJ', tier: 1, category: 'journal' },
  { domain: 'journals.aps.org', name: 'APS Journals', tier: 1, category: 'journal' },
  { domain: 'iopscience.iop.org', name: 'IOP Science', tier: 1, category: 'journal' },
  { domain: 'journals.plos.org', name: 'PLOS', tier: 1, category: 'journal' },
  { domain: 'frontiersin.org', name: 'Frontiers', tier: 1, category: 'journal' },
  { domain: 'academic.oup.com', name: 'Oxford Academic', tier: 1, category: 'journal' },
  { domain: 'link.springer.com', name: 'Springer', tier: 1, category: 'journal' },
  { domain: 'sciencedirect.com', name: 'ScienceDirect', tier: 1, category: 'journal' },
  { domain: 'onlinelibrary.wiley.com', name: 'Wiley', tier: 1, category: 'journal' },
  { domain: 'jstor.org', name: 'JSTOR', tier: 1, category: 'journal' },
  { domain: 'jamanetwork.com', name: 'JAMA Network', tier: 1, category: 'journal' },
  { domain: 'ieee.org', name: 'IEEE', tier: 1, category: 'journal' },
  { domain: 'acm.org', name: 'ACM', tier: 1, category: 'journal' },

  // Government research
  { domain: 'nasa.gov', name: 'NASA', tier: 1, category: 'government' },
  { domain: 'nih.gov', name: 'NIH', tier: 1, category: 'government' },
  {
    domain: 'ncbi.nlm.nih.gov',
    name: 'PubMed/NCBI',
    tier: 1,
    category: 'government',
    searchTemplate: 'https://pubmed.ncbi.nlm.nih.gov/?term={query}',
  },
  { domain: 'cdc.gov', name: 'CDC', tier: 1, category: 'government' },
  { domain: 'nsf.gov', name: 'NSF', tier: 1, category: 'government' },
  { domain: 'energy.gov', name: 'DOE', tier: 1, category: 'government' },
  { domain: 'nist.gov', name: 'NIST', tier: 1, category: 'government' },
  { domain: 'cern.ch', name: 'CERN', tier: 1, category: 'government' },
  { domain: 'who.int', name: 'WHO', tier: 1, category: 'government' },
  { domain: 'noaa.gov', name: 'NOAA', tier: 1, category: 'government' },
  { domain: 'usgs.gov', name: 'USGS', tier: 1, category: 'government' },
  { domain: 'epa.gov', name: 'EPA', tier: 1, category: 'government' },
  { domain: 'fda.gov', name: 'FDA', tier: 1, category: 'government' },

  // Research indices
  {
    domain: 'semanticscholar.org',
    name: 'Semantic Scholar',
    tier: 1,
    category: 'preprint',
    searchTemplate:
      'https://api.semanticscholar.org/graph/v1/paper/search?query={query}&limit=10&fields=title,abstract,url,year,citationCount',
  },
  { domain: 'scholar.google.com', name: 'Google Scholar', tier: 1, category: 'preprint' },
  { domain: 'doi.org', name: 'DOI', tier: 1, category: 'journal' },
];

// ─── Tier 2: Universities & Encyclopedias ───────────────────
const TIER_2_SOURCES: KnowledgeSource[] = [
  // Universities
  { domain: 'mit.edu', name: 'MIT', tier: 2, category: 'university' },
  { domain: 'stanford.edu', name: 'Stanford', tier: 2, category: 'university' },
  { domain: 'harvard.edu', name: 'Harvard', tier: 2, category: 'university' },
  { domain: 'caltech.edu', name: 'Caltech', tier: 2, category: 'university' },
  { domain: 'berkeley.edu', name: 'UC Berkeley', tier: 2, category: 'university' },
  { domain: 'ox.ac.uk', name: 'Oxford', tier: 2, category: 'university' },
  { domain: 'cam.ac.uk', name: 'Cambridge', tier: 2, category: 'university' },
  { domain: 'yale.edu', name: 'Yale', tier: 2, category: 'university' },
  { domain: 'princeton.edu', name: 'Princeton', tier: 2, category: 'university' },
  { domain: 'columbia.edu', name: 'Columbia', tier: 2, category: 'university' },
  { domain: 'uchicago.edu', name: 'U Chicago', tier: 2, category: 'university' },
  { domain: 'cornell.edu', name: 'Cornell', tier: 2, category: 'university' },
  { domain: 'jhu.edu', name: 'Johns Hopkins', tier: 2, category: 'university' },

  // Encyclopedias / reference
  { domain: 'britannica.com', name: 'Britannica', tier: 2, category: 'encyclopedia' },
  { domain: 'wikipedia.org', name: 'Wikipedia', tier: 2, category: 'encyclopedia' },
  { domain: 'plato.stanford.edu', name: 'Stanford Encyclopedia of Philosophy', tier: 2, category: 'encyclopedia' },
  { domain: 'mathworld.wolfram.com', name: 'MathWorld', tier: 2, category: 'encyclopedia' },

  // AI/ML research labs
  { domain: 'openai.com', name: 'OpenAI Research', tier: 2, category: 'technical' },
  { domain: 'deepmind.com', name: 'DeepMind', tier: 2, category: 'technical' },
  { domain: 'anthropic.com', name: 'Anthropic', tier: 2, category: 'technical' },
  { domain: 'ai.google', name: 'Google AI', tier: 2, category: 'technical' },
  { domain: 'research.facebook.com', name: 'Meta AI', tier: 2, category: 'technical' },
  { domain: 'research.microsoft.com', name: 'Microsoft Research', tier: 2, category: 'technical' },
];

// ─── Tier 3: Quality Science Journalism ─────────────────────
const TIER_3_SOURCES: KnowledgeSource[] = [
  { domain: 'quantamagazine.org', name: 'Quanta Magazine', tier: 3, category: 'science-news' },
  { domain: 'scientificamerican.com', name: 'Scientific American', tier: 3, category: 'science-news' },
  { domain: 'sciencedaily.com', name: 'ScienceDaily', tier: 3, category: 'science-news' },
  { domain: 'newscientist.com', name: 'New Scientist', tier: 3, category: 'science-news' },
  { domain: 'sciencenews.org', name: 'Science News', tier: 3, category: 'science-news' },
  { domain: 'phys.org', name: 'Phys.org', tier: 3, category: 'science-news' },
  { domain: 'livescience.com', name: 'Live Science', tier: 3, category: 'science-news' },
  { domain: 'space.com', name: 'Space.com', tier: 3, category: 'science-news' },
  { domain: 'arstechnica.com', name: 'Ars Technica', tier: 3, category: 'science-news' },
  { domain: 'wired.com', name: 'Wired', tier: 3, category: 'science-news' },
  { domain: 'symmetrymagazine.org', name: 'Symmetry Magazine', tier: 3, category: 'science-news' },
  { domain: 'the-scientist.com', name: 'The Scientist', tier: 3, category: 'science-news' },
  { domain: 'smithsonianmag.com', name: 'Smithsonian', tier: 3, category: 'science-news' },
  { domain: 'nationalgeographic.com', name: 'National Geographic', tier: 3, category: 'science-news' },
];

const ALL_SOURCES = [...TIER_1_SOURCES, ...TIER_2_SOURCES, ...TIER_3_SOURCES];

const DOMAIN_MAP = new Map<string, KnowledgeSource>();
for (const src of ALL_SOURCES) {
  DOMAIN_MAP.set(src.domain, src);
}

// ─── Public API ─────────────────────────────────────────────

/** Check if a domain is in our trusted source registry */
export function isVerifiedSource(url: string): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;
  if (BLOCKED_DOMAINS.has(domain)) return false;
  return DOMAIN_MAP.has(domain) || matchesTrustedDomain(domain);
}

/** Get the trust tier for a URL (1=highest, 3=lowest, null=untrusted) */
export function getSourceTier(url: string): TrustTier | null {
  const domain = extractDomain(url);
  if (!domain) return null;
  const src = DOMAIN_MAP.get(domain) || findBySubdomain(domain);
  return src?.tier ?? null;
}

/** Get source info for a URL */
export function getSourceInfo(url: string): KnowledgeSource | null {
  const domain = extractDomain(url);
  if (!domain) return null;
  return DOMAIN_MAP.get(domain) || findBySubdomain(domain) || null;
}

/** Check if a URL is explicitly blocked */
export function isBlockedUrl(url: string): boolean {
  const domain = extractDomain(url);
  if (domain && BLOCKED_DOMAINS.has(domain)) return true;
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

/** Get all sources for a given category */
export function getSourcesByCategory(category: SourceCategory): KnowledgeSource[] {
  return ALL_SOURCES.filter((s) => s.category === category);
}

/** Get all sources at or above a trust tier */
export function getSourcesByTier(maxTier: TrustTier): KnowledgeSource[] {
  return ALL_SOURCES.filter((s) => s.tier <= maxTier);
}

/** Build search queries targeting trusted sources */
export function buildSourceTargetedQuery(query: string, tier: TrustTier = 2): string {
  const siteClauses = ALL_SOURCES.filter((s) => s.tier <= tier)
    .slice(0, 8) // DuckDuckGo handles ~8 site: clauses well
    .map((s) => `site:${s.domain}`)
    .join(' OR ');
  return `${query} (${siteClauses})`;
}

/** Calculate a trust score (0-1) for a given URL based on source tier */
export function calculateTrustScore(url: string): number {
  if (isBlockedUrl(url)) return 0;
  const tier = getSourceTier(url);
  if (tier === null) return 0.1; // Unknown source gets minimal trust
  // Tier 1 = 1.0, Tier 2 = 0.8, Tier 3 = 0.6
  return 1.0 - (tier - 1) * 0.2;
}

// ─── Helpers ────────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return null;
  }
}

function matchesTrustedDomain(domain: string): boolean {
  for (const src of ALL_SOURCES) {
    if (domain.endsWith(`.${src.domain}`) || domain === src.domain) return true;
  }
  return false;
}

function findBySubdomain(domain: string): KnowledgeSource | undefined {
  for (const src of ALL_SOURCES) {
    if (domain.endsWith(`.${src.domain}`)) return src;
  }
  return undefined;
}
