#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function normalizeContent(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeTags(a, b) {
  const seen = new Set();
  const merged = [];
  for (const tag of [...(a || []), ...(b || [])]) {
    const normalized = String(tag || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function chooseEmbedding(current, incoming) {
  const curLen = Array.isArray(current) ? current.length : 0;
  const inLen = Array.isArray(incoming) ? incoming.length : 0;
  if (curLen === 0) return incoming;
  if (inLen === 0) return current;
  return inLen >= curLen ? incoming : current;
}

function makeBackup(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function compactFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const hasMemories = Array.isArray(parsed?.memories);
  const hasVectors = Array.isArray(parsed?.vectors);
  const collectionKey = hasMemories ? 'memories' : (hasVectors ? 'vectors' : 'memories');
  const items = Array.isArray(parsed?.[collectionKey]) ? parsed[collectionKey] : [];
  const before = items.length;

  const byKey = new Map();
  let missingContent = 0;
  let mergedCount = 0;

  for (const mem of items) {
    if (!mem || typeof mem !== 'object') continue;
    const normalized = normalizeContent(mem.content);
    if (!normalized) {
      missingContent += 1;
      continue;
    }
    const key = `${mem.type || 'episodic'}|${mem.source || 'unknown'}|${normalized}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...mem });
      continue;
    }

    mergedCount += 1;
    const existingImp = asNumber(existing.importance, 0.5);
    const incomingImp = asNumber(mem.importance, 0.5);
    const existingTs = asNumber(existing.timestamp, 0);
    const incomingTs = asNumber(mem.timestamp, 0);

    existing.importance = Math.max(existingImp, incomingImp);
    existing.timestamp = Math.max(existingTs, incomingTs);
    existing.accessCount = asNumber(existing.accessCount, 0) + asNumber(mem.accessCount, 0);
    existing.reinforcementCount = asNumber(existing.reinforcementCount, 0) + asNumber(mem.reinforcementCount, 0) + 1;
    existing.lastAccessed = Math.max(asNumber(existing.lastAccessed, 0), asNumber(mem.lastAccessed, 0));
    existing.lastReinforcedAt = Math.max(asNumber(existing.lastReinforcedAt, 0), incomingTs);
    existing.tags = mergeTags(existing.tags, mem.tags);

    if (!existing.emotion && mem.emotion) existing.emotion = mem.emotion;
    if ((incomingTs > existingTs) && mem.content && String(mem.content).length > String(existing.content || '').length) {
      existing.content = mem.content;
    }
    existing.embedding = chooseEmbedding(existing.embedding, mem.embedding);
  }

  const compacted = Array.from(byKey.values());
  compacted.sort((a, b) => asNumber(b.timestamp, 0) - asNumber(a.timestamp, 0));

  parsed[collectionKey] = compacted;
  parsed.version = parsed.version || 1;
  parsed.compactedAt = Date.now();

  const backupPath = makeBackup(filePath);
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf8');

  return {
    filePath,
    backupPath,
    collectionKey,
    before,
    after: compacted.length,
    removed: before - compacted.length,
    mergedCount,
    missingContent,
  };
}

function main() {
  const targets = process.argv.slice(2);
  if (targets.length === 0) {
    console.error('Usage: node scripts/compact-vectors.js <path-to-vectors.json> [more paths]');
    process.exit(1);
  }

  const results = [];
  for (const target of targets) {
    const resolved = path.resolve(target);
    const result = compactFile(resolved);
    results.push(result);
  }
  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  compactFile,
  normalizeContent,
};
