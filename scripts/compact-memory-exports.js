#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    limit: 3,
    delayMs: 1200,
    dryRun: false,
  };
  for (const token of argv) {
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token.startsWith('--limit=')) {
      args.limit = Math.max(1, Number(token.split('=')[1]) || 3);
      continue;
    }
    if (token.startsWith('--delayMs=')) {
      args.delayMs = Math.max(0, Number(token.split('=')[1]) || 1200);
      continue;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDefaultDirs() {
  return [
    path.resolve(__dirname, '..', 'Memory'),
    path.resolve(__dirname, '..', 'AGIPRIME', 'Memory'),
  ];
}

function listExportFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir);
  const backupPrefixes = new Set(
    names
      .filter((n) => n.includes('.json.bak-'))
      .map((n) => n.split('.json.bak-')[0] + '.json')
  );

  return names
    .filter((n) => n.startsWith('memory-export-') && n.endsWith('.json'))
    .map((name) => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      return {
        path: fullPath,
        name,
        size: stat.size,
        modified: stat.mtimeMs,
        alreadyCompacted: backupPrefixes.has(name),
      };
    });
}

function runCompact(compactScriptPath, targetPath) {
  const child = spawnSync(
    process.execPath,
    [compactScriptPath, targetPath],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 4,
    }
  );
  if (child.status !== 0) {
    throw new Error((child.stderr || child.stdout || `Compaction failed for ${targetPath}`).trim());
  }
  const parsed = JSON.parse(child.stdout || '[]');
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const compactScriptPath = path.resolve(__dirname, 'compact-vectors.js');
  const dirs = getDefaultDirs();

  let files = [];
  for (const dir of dirs) {
    files = files.concat(listExportFiles(dir));
  }

  const candidates = files
    .filter((f) => !f.alreadyCompacted)
    .sort((a, b) => b.modified - a.modified)
    .slice(0, args.limit);

  if (candidates.length === 0) {
    console.log(JSON.stringify({ processed: 0, message: 'No un-compacted export files found.' }, null, 2));
    return;
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      processed: 0,
      dryRun: true,
      selected: candidates.map((c) => ({
        path: c.path,
        sizeMB: Number((c.size / (1024 * 1024)).toFixed(1)),
      })),
    }, null, 2));
    return;
  }

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const current = candidates[i];
    const result = runCompact(compactScriptPath, current.path);
    results.push(result);
    if (i < candidates.length - 1 && args.delayMs > 0) {
      await sleep(args.delayMs);
    }
  }

  const totals = results.reduce((acc, r) => {
    acc.before += Number(r.before || 0);
    acc.after += Number(r.after || 0);
    acc.removed += Number(r.removed || 0);
    return acc;
  }, { before: 0, after: 0, removed: 0 });

  console.log(JSON.stringify({
    processed: results.length,
    totals,
    results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
