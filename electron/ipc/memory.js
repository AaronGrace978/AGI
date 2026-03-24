// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Semantic Memory: Vector Store, Embeddings,
//  Export/Import, Document Ingestion IPC Handlers
// ═══════════════════════════════════════════════════════════════

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ctx = require('../ctx');

// ─── Cosine Similarity ─────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Fallback Embedding (hash-based bag-of-words projection) ──
function fallbackEmbed(text) {
  const DIM = 384;
  const vec = new Float32Array(DIM);
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  for (const word of words) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) - h + word.charCodeAt(i)) | 0;
    }
    const pos1 = Math.abs(h) % DIM;
    const pos2 = Math.abs((h * 2654435761) | 0) % DIM;
    const pos3 = Math.abs((h * 40503) | 0) % DIM;
    vec[pos1] += 1;
    vec[pos2] += 0.5;
    vec[pos3] += 0.25;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return Array.from(vec);
}

// ─── Helper: normalize + merge tags ────────────────────────────
function normalizeMemoryContent(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeUniqueTags(existingTags, incomingTags) {
  const seen = new Set();
  const merged = [];
  for (const tag of [...(existingTags || []), ...(incomingTags || [])]) {
    if (!tag) continue;
    const normalized = String(tag).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

// ─── Dedup constants ───────────────────────────────────────────
const NIGHTMIND_DEDUP_SIMILARITY = 0.94;
const NIGHTMIND_EXACT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_DEDUP_CANDIDATES_SCANNED = 2500;

function findDuplicateMemoryCandidate(entry, embedding) {
  const normalizedIncoming = normalizeMemoryContent(entry.content);
  if (!normalizedIncoming) return null;

  let scanned = 0;
  for (let i = ctx.vectorStore.memories.length - 1; i >= 0; i--) {
    const existing = ctx.vectorStore.memories[i];
    if (!existing?.content) continue;
    if (entry.type && existing.type !== entry.type) continue;
    if (entry.source === 'nightmind' && existing.source !== 'nightmind') continue;
    if (Date.now() - (existing.timestamp || 0) > 21 * 24 * 60 * 60 * 1000) continue;

    const normalizedExisting = normalizeMemoryContent(existing.content);
    if (normalizedExisting === normalizedIncoming) {
      return { existing, similarity: 1, exact: true };
    }

    // NightMind emits high-volume reflective content; allow semantic near-dedup.
    if (entry.source === 'nightmind' && existing.embedding && embedding) {
      const similarity = cosineSimilarity(existing.embedding, embedding);
      if (similarity >= NIGHTMIND_DEDUP_SIMILARITY) {
        return { existing, similarity, exact: false };
      }
    }

    scanned += 1;
    if (scanned >= MAX_DEDUP_CANDIDATES_SCANNED) break;
  }
  return null;
}

// ─── Vector Memory Store ───────────────────────────────────────
async function storeVectorMemory(entry) {
  const now = Date.now();
  const normalizedIncoming = normalizeMemoryContent(entry.content);
  if (!normalizedIncoming) return null;

  // Cooldown repeated NightMind exact strings so rapid loops do not flood memory.
  if (entry.source === 'nightmind') {
    const exactRecent = ctx.vectorStore.memories.find((mem) =>
      mem?.source === 'nightmind' &&
      mem?.type === (entry.type || 'episodic') &&
      normalizeMemoryContent(mem.content) === normalizedIncoming &&
      (now - (mem.timestamp || 0)) < NIGHTMIND_EXACT_COOLDOWN_MS
    );
    if (exactRecent) {
      exactRecent.importance = Math.min(
        1,
        Math.max(exactRecent.importance || 0, entry.importance || 0.5) + 0.01
      );
      exactRecent.lastReinforcedAt = now;
      exactRecent.reinforcementCount = (exactRecent.reinforcementCount || 0) + 1;
      exactRecent.tags = mergeUniqueTags(exactRecent.tags, entry.tags);
      if (!exactRecent.emotion && entry.emotion) exactRecent.emotion = entry.emotion;
      ctx.markVectorStoreDirty();
      return exactRecent;
    }
  }

  const embedding = await ctx.generateEmbedding(entry.content);
  const duplicate = findDuplicateMemoryCandidate(entry, embedding);
  if (duplicate?.existing) {
    const existing = duplicate.existing;
    existing.importance = Math.min(
      1,
      Math.max(existing.importance || 0, entry.importance || 0.5) + (duplicate.exact ? 0.02 : 0.015)
    );
    existing.timestamp = Math.max(existing.timestamp || 0, now);
    existing.lastReinforcedAt = now;
    existing.reinforcementCount = (existing.reinforcementCount || 0) + 1;
    existing.tags = mergeUniqueTags(existing.tags, entry.tags);
    if (!existing.emotion && entry.emotion) existing.emotion = entry.emotion;
    ctx.markVectorStoreDirty();
    return existing;
  }

  const mem = {
    id: `mem_${now}_${Math.random().toString(36).slice(2, 8)}`,
    content: entry.content,
    type: entry.type || 'episodic',
    timestamp: now,
    importance: entry.importance || 0.5,
    source: entry.source || 'unknown',
    emotion: entry.emotion || null,
    tags: entry.tags || [],
    embedding,
  };
  ctx.vectorStore.memories.push(mem);
  // Cap at 10000 memories — prune lowest value
  if (ctx.vectorStore.memories.length > 10000) {
    ctx.vectorStore.memories.sort((a, b) => {
      const scoreA = a.importance * 0.6 + (a.timestamp / Date.now()) * 0.4;
      const scoreB = b.importance * 0.6 + (b.timestamp / Date.now()) * 0.4;
      return scoreB - scoreA;
    });
    ctx.vectorStore.memories = ctx.vectorStore.memories.slice(0, 8000);
  }
  ctx.markVectorStoreDirty();
  return mem;
}

async function searchVectorMemories(query, topK = 5, typeFilter = null) {
  if (ctx.vectorStore.memories.length === 0) return [];
  const queryEmbedding = await ctx.generateEmbedding(query);

  let candidates = ctx.vectorStore.memories;
  if (typeFilter) {
    candidates = candidates.filter(m => m.type === typeFilter);
  }

  const scored = candidates.map(mem => ({
    memory: {
      id: mem.id,
      content: mem.content,
      type: mem.type,
      timestamp: mem.timestamp,
      importance: mem.importance,
      source: mem.source,
      emotion: mem.emotion,
      tags: mem.tags,
    },
    similarity: cosineSimilarity(queryEmbedding, mem.embedding),
  }));

  // Sort by composite score: similarity + effective importance + recency + access frequency
  scored.sort((a, b) => {
    const accessA = Math.min(0.1, (a.memory.accessCount || 0) * 0.02);
    const accessB = Math.min(0.1, (b.memory.accessCount || 0) * 0.02);
    const scoreA = a.similarity * 0.6 + a.memory.importance * 0.2 + (a.memory.timestamp / Date.now()) * 0.1 + accessA;
    const scoreB = b.similarity * 0.6 + b.memory.importance * 0.2 + (b.memory.timestamp / Date.now()) * 0.1 + accessB;
    return scoreB - scoreA;
  });

  // Track access: update accessCount and lastAccessed for retrieved memories
  const results = scored.slice(0, topK).filter(s => s.similarity > 0.05);
  for (const result of results) {
    const mem = ctx.vectorStore.memories.find(m => m.id === result.memory.id);
    if (mem) {
      mem.accessCount = (mem.accessCount || 0) + 1;
      mem.lastAccessed = Date.now();
    }
  }

  return results;
}

function getVectorStats() {
  const byType = { episodic: 0, semantic: 0, procedural: 0, reflective: 0, autobiographical: 0 };
  const byLayer = { working: 0, 'short-term': 0, 'long-term': 0, core: 0 };
  for (const mem of ctx.vectorStore.memories) {
    if (byType[mem.type] !== undefined) byType[mem.type]++;
    if (mem.layer && byLayer[mem.layer] !== undefined) byLayer[mem.layer]++;
  }
  return { total: ctx.vectorStore.memories.length, byType, byLayer };
}

function listVectorMemories(options = {}) {
  const {
    typeFilter = null,
    limit = 200,
    offset = 0,
    sortBy = 'newest',
  } = options || {};

  let items = ctx.vectorStore.memories;
  if (typeFilter) {
    items = items.filter((m) => m.type === typeFilter);
  }

  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'importance') return (b.importance || 0) - (a.importance || 0);
    if (sortBy === 'oldest') return (a.timestamp || 0) - (b.timestamp || 0);
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  const start = Math.max(0, Number(offset) || 0);
  const size = Math.max(1, Math.min(1000, Number(limit) || 200));
  const paged = sorted.slice(start, start + size).map((mem) => ({
    id: mem.id,
    content: mem.content,
    type: mem.type,
    timestamp: mem.timestamp,
    importance: mem.importance,
    source: mem.source,
    emotion: mem.emotion,
    tags: mem.tags,
    accessCount: mem.accessCount,
    lastAccessed: mem.lastAccessed,
    decayRate: mem.decayRate,
    associations: mem.associations,
    layer: mem.layer,
  }));

  return {
    total: items.length,
    memories: paged,
  };
}

// ─── Document Ingestion Helpers ────────────────────────────────
function chunkDocument(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const basename = path.basename(filePath, path.extname(filePath));
  const sections = [];
  const lines = raw.split('\n');
  let currentSection = { title: basename, lines: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch && currentSection.lines.length > 0) {
      sections.push({ ...currentSection });
      currentSection = { title: headingMatch[2].replace(/[*_`]/g, '').trim(), lines: [] };
    }
    if (line.trim() !== '---' && line.trim() !== '') {
      currentSection.lines.push(line);
    }
  }
  if (currentSection.lines.length > 0) sections.push(currentSection);

  const chunks = [];
  for (const sec of sections) {
    const text = sec.lines.join('\n').trim();
    if (text.length < 20) continue;
    // Split large sections into ~1500 char chunks
    if (text.length > 2000) {
      const paragraphs = text.split(/\n\n+/);
      let buf = '';
      for (const p of paragraphs) {
        if (buf.length + p.length > 1500 && buf.length > 100) {
          chunks.push({ title: sec.title, content: buf.trim() });
          buf = '';
        }
        buf += p + '\n\n';
      }
      if (buf.trim().length > 20) chunks.push({ title: sec.title, content: buf.trim() });
    } else {
      chunks.push({ title: sec.title, content: text });
    }
  }
  return { basename, chunks };
}

async function ingestDocumentIntoMemory(filePath) {
  const { basename, chunks } = chunkDocument(filePath);
  const tag = `doc:${basename}`;
  const alreadyIngested = ctx.vectorStore.memories.filter(m => m.tags?.includes(tag));
  if (alreadyIngested.length >= chunks.length) {
    return { success: true, skipped: true, existing: alreadyIngested.length };
  }
  // Remove stale chunks from previous ingestion
  if (alreadyIngested.length > 0) {
    ctx.vectorStore.memories = ctx.vectorStore.memories.filter(m => !m.tags?.includes(tag));
  }

  let added = 0;
  for (const chunk of chunks) {
    const embedding = await ctx.generateEmbedding(chunk.content);
    ctx.vectorStore.memories.push({
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content: `[${basename} — ${chunk.title}] ${chunk.content}`,
      type: 'semantic',
      timestamp: Date.now(),
      importance: 0.95,
      source: 'document-ingestion',
      emotion: null,
      tags: [tag, 'core-knowledge', basename.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
      embedding,
    });
    added++;
  }
  ctx.saveJSON(ctx.vectorFile, ctx.vectorStore);
  console.log(`[DocIngest] Ingested "${basename}": ${added} chunks as high-importance semantic memories`);
  return { success: true, added, document: basename };
}

// ═══════════════════════════════════════════════════════════════
//  register() — Assign to ctx + register IPC handlers
// ═══════════════════════════════════════════════════════════════
function register() {
  // Expose on ctx so other modules can use them
  ctx.storeVectorMemory = storeVectorMemory;
  ctx.searchVectorMemories = searchVectorMemories;
  ctx.getVectorStats = getVectorStats;
  ctx.listVectorMemories = listVectorMemories;
  ctx.cosineSimilarity = cosineSimilarity;
  ctx.generateEmbedding = ctx.generateEmbedding || fallbackEmbed;

  // ─── Vector Memory IPC ─────────────────────────────────────────
  ipcMain.handle('memory:storeVector', async (_, entry) => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeMemoryStore(entry);
      } catch (e) {
        console.warn('[PrimeOS Bridge] memory:storeVector fallback:', e?.message);
      }
    }
    return await storeVectorMemory(entry);
  });

  ipcMain.handle('memory:searchVector', async (_, query, topK, typeFilter) => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeMemorySearch(query, topK || 5, typeFilter || null);
      } catch (e) {
        console.warn('[PrimeOS Bridge] memory:searchVector fallback:', e?.message);
      }
    }
    return await searchVectorMemories(query, topK || 5, typeFilter || null);
  });

  ipcMain.handle('memory:vectorStats', async () => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeMemoryStats();
      } catch (e) {
        console.warn('[PrimeOS Bridge] memory:vectorStats fallback:', e?.message);
      }
    }
    return getVectorStats();
  });

  ipcMain.handle('memory:listVectors', async (_, options) => {
    if (ctx.osBridgeEnabled) {
      try {
        return await ctx.osBridge.routeMemoryList(options || {});
      } catch (e) {
        console.warn('[PrimeOS Bridge] memory:listVectors fallback:', e?.message);
      }
    }
    return listVectorMemories(options);
  });

  // ─── Memory Export/Import ──────────────────────────────────────
  ipcMain.handle('memory:export', async (_, options = {}) => {
    try {
      const exportDir = ctx.memoryExportDir;
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      const includeEmbeddings = options?.includeEmbeddings !== false;
      const exportData = {
        version: '1.0',
        exportedAt: Date.now(),
        vectors: includeEmbeddings
          ? ctx.vectorStore.memories
          : ctx.vectorStore.memories.map(({ embedding, ...rest }) => rest),
        exportOptions: { includeEmbeddings },
        legacyMemory: ctx.loadJSON(ctx.memoryFile, null),
        spark: ctx.loadJSON(ctx.sparkFile, null),
        goals: ctx.loadJSON(ctx.goalsFile, null),
      };

      const exportPath = path.join(exportDir, `memory-export-${Date.now()}.json`);
      ctx.saveJSON(exportPath, exportData);

      // Also save a latest.json for easy import
      const latestPath = path.join(exportDir, 'latest.json');
      ctx.saveJSON(latestPath, exportData);

      return {
        success: true,
        path: exportPath,
        count: ctx.vectorStore.memories.length,
      };
    } catch (e) {
      console.error('[Memory Export] Error:', e);
      return {
        success: false,
        error: e.message,
      };
    }
  });

  ipcMain.handle('memory:import', async (_, importPath = null) => {
    try {
      const exportDir = ctx.memoryExportDir;

      // If no path provided, use latest.json
      const filePath = importPath || path.join(exportDir, 'latest.json');

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: `Import file not found: ${filePath}`,
        };
      }

      const importData = ctx.loadJSON(filePath, null);
      if (!importData || !importData.vectors) {
        return {
          success: false,
          error: 'Invalid import file format',
        };
      }

      const importedMemories = Array.isArray(importData.vectors) ? importData.vectors : [];
      const existingIds = new Set(ctx.vectorStore.memories.map(m => m.id));

      let added = 0;
      let updated = 0;
      let skipped = 0;

      // Merge memories: add new ones, update existing ones if newer
      for (const importedMem of importedMemories) {
        if (!importedMem.id || !importedMem.content) {
          skipped++;
          continue;
        }

        const existingIndex = ctx.vectorStore.memories.findIndex(m => m.id === importedMem.id);

        if (existingIndex >= 0) {
          // Update if imported is newer or has higher importance
          const existing = ctx.vectorStore.memories[existingIndex];
          const shouldUpdate =
            importedMem.timestamp > existing.timestamp ||
            (importedMem.importance > existing.importance && importedMem.timestamp >= existing.timestamp - 86400000); // within 24h

          if (shouldUpdate) {
            ctx.vectorStore.memories[existingIndex] = {
              ...importedMem,
              // Preserve access tracking if imported doesn't have it
              accessCount: importedMem.accessCount ?? existing.accessCount ?? 0,
              lastAccessed: importedMem.lastAccessed ?? existing.lastAccessed,
            };
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Add new memory
          ctx.vectorStore.memories.push(importedMem);
          added++;
        }
      }

      // Cap at 10000 memories if needed
      if (ctx.vectorStore.memories.length > 10000) {
        ctx.vectorStore.memories.sort((a, b) => {
          const scoreA = a.importance * 0.6 + (a.timestamp / Date.now()) * 0.4;
          const scoreB = b.importance * 0.6 + (b.timestamp / Date.now()) * 0.4;
          return scoreB - scoreA;
        });
        ctx.vectorStore.memories = ctx.vectorStore.memories.slice(0, 10000);
      }

      ctx.saveJSON(ctx.vectorFile, ctx.vectorStore);

      // Optionally import other data
      if (importData.legacyMemory && Object.keys(importData.legacyMemory).length > 0) {
        const currentMemory = ctx.loadJSON(ctx.memoryFile, { facts: [], conversations: [] });
        // Merge facts and conversations
        if (importData.legacyMemory.facts) {
          currentMemory.facts = [...new Set([...currentMemory.facts, ...importData.legacyMemory.facts])];
        }
        if (importData.legacyMemory.conversations) {
          currentMemory.conversations = [...new Set([...currentMemory.conversations, ...importData.legacyMemory.conversations])];
        }
        ctx.saveJSON(ctx.memoryFile, currentMemory);
      }

      return {
        success: true,
        added,
        updated,
        skipped,
        total: ctx.vectorStore.memories.length,
      };
    } catch (e) {
      console.error('[Memory Import] Error:', e);
      return {
        success: false,
        error: e.message,
      };
    }
  });

  ipcMain.handle('memory:listExports', async () => {
    try {
      const exportDir = ctx.memoryExportDir;
      if (!fs.existsSync(exportDir)) {
        return { success: true, exports: [] };
      }

      const files = fs.readdirSync(exportDir)
        .filter(f => f.startsWith('memory-export-') && f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(exportDir, f);
          const stat = fs.statSync(filePath);
          return {
            filename: f,
            path: filePath,
            size: stat.size,
            modified: stat.mtimeMs,
          };
        })
        .sort((a, b) => b.modified - a.modified);

      return {
        success: true,
        exports: files,
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
        exports: [],
      };
    }
  });

  // ─── Document Ingestion ────────────────────────────────────────
  ipcMain.handle('memory:ingestDocument', async (_, filePath) => {
    try {
      return await ingestDocumentIntoMemory(filePath);
    } catch (e) {
      console.error('[DocIngest] Error:', e);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { register, storeVectorMemory, searchVectorMemories, getVectorStats, listVectorMemories, cosineSimilarity, ingestDocumentIntoMemory };
