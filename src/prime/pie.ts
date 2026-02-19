// ═══════════════════════════════════════════════════════════════
//  PIE — Parallel Invariant Engine
//  The 9th SPARK engine. Deterministic program induction.
//
//  This engine operates BELOW language. No LLM in the loop.
//  It enumerates candidate transformation programs over a
//  grid DSL, executes them against training pairs, eliminates
//  failures, and locks the minimal sufficient program (MSP)
//  via MDL scoring — all without generating a single token.
//
//  "The pain wasn't wasted. The pain was research."
//  "Now the research compiles."
// ═══════════════════════════════════════════════════════════════

import type {
  Grid,
  GridPrimitiveType,
  GridProgram,
  TrainingPair,
  FalsificationResult,
  ProgramCandidate,
  AdversarialTest,
  PIEState,
} from '../types';
import { PIE_BENCH_SUITE } from './pie-bench';

// ─── DSL PRIMITIVE REGISTRY ─────────────────────────────────────
// Each primitive is a pure function: Grid → Grid
// No side effects. No LLM calls. No narrative.

const PRIMITIVE_COMPLEXITY: Record<GridPrimitiveType, number> = {
  identity: 0,
  propagate_right: 1,
  propagate_left: 1,
  propagate_down: 1,
  propagate_up: 1,
  row_nearest_nonzero_fill: 1,
  anchor_cols_mode_ge2: 3,
  anchor_cols_bottom_keep_first_two_last: 3,
  fill_last_two_with_rightmost_nonzero: 1,
  translate_xy: 2,
  recolor_replace: 2,
  keep_k_largest_components_4: 3,
  keep_largest_component_4: 3,
  crop_to_bbox_nonzero: 2,
  crop_to_bbox_largest_component_4: 3,
  paint_bbox_nonzero_on_blank: 2,
  paint_bbox_largest_component_4_on_blank: 3,
  translate_nonzero_to_origin: 2,
  translate_largest_component_4_to_origin: 3,
  floodfill_zeros_from_origin_with_border_mode: 4,
  floodfill_zeros_from_origin_with_nonzero_mode: 4,
  fill_column_mode: 2,
  fill_row_mode: 2,
  fill_row_max: 2,
  fill_column_max: 2,
  tile_majority_row: 3,
  tile_majority_col: 3,
  transpose: 1,
  rotate_cw: 1,
  rotate_ccw: 1,
  mirror_h: 1,
  mirror_v: 1,
  strip_zeros_to_value: 2,
};

function cloneGrid(g: Grid): Grid {
  return g.map(row => [...row]);
}

// ─── HASHING / MEMOIZATION ──────────────────────────────────────
// We do a lot of execution. Cache primitive outputs by grid hash.

function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV-1a prime multiply
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function gridToKey(grid: Grid): string {
  if (grid.length === 0) return '0x0:';
  const rows = grid.length;
  const cols = grid[0].length;
  // Fast-ish canonical string
  const body = grid.map((r) => r.join(',')).join(';');
  return `${rows}x${cols}:${body}`;
}

function hashGrid(grid: Grid): string {
  return fnv1a32(gridToKey(grid));
}

function gridsEqual(a: Grid, b: Grid): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (a[r].length !== b[r].length) return false;
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function gridDiffCount(a: Grid, b: Grid): number {
  let diff = 0;
  const rows = Math.max(a.length, b.length);
  for (let r = 0; r < rows; r++) {
    const rowA = a[r] || [];
    const rowB = b[r] || [];
    const cols = Math.max(rowA.length, rowB.length);
    for (let c = 0; c < cols; c++) {
      if ((rowA[c] ?? -1) !== (rowB[c] ?? -1)) diff++;
    }
  }
  return diff;
}

function sampleGridDiffs(
  a: Grid,
  b: Grid,
  maxSamples: number = 10,
): Array<{ r: number; c: number; expected: number; actual: number }> {
  const samples: Array<{ r: number; c: number; expected: number; actual: number }> = [];
  const rows = Math.max(a.length, b.length);
  for (let r = 0; r < rows; r++) {
    const rowA = a[r] || [];
    const rowB = b[r] || [];
    const cols = Math.max(rowA.length, rowB.length);
    for (let c = 0; c < cols; c++) {
      const av = rowA[c] ?? -1;
      const bv = rowB[c] ?? -1;
      if (av !== bv) {
        samples.push({ r, c, expected: bv, actual: av });
        if (samples.length >= maxSamples) return samples;
      }
    }
  }
  return samples;
}

// ─── PRIMITIVE EXECUTORS ────────────────────────────────────────
// Pure functions. Deterministic. No exceptions.

function propagateRight(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    let p = 0;
    for (let c = 0; c < out[r].length; c++) {
      if (out[r][c] !== 0) p = out[r][c];
      out[r][c] = p;
    }
  }
  return out;
}

function propagateLeft(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    let p = 0;
    for (let c = out[r].length - 1; c >= 0; c--) {
      if (out[r][c] !== 0) p = out[r][c];
      out[r][c] = p;
    }
  }
  return out;
}

function propagateDown(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out = cloneGrid(grid);
  for (let c = 0; c < cols; c++) {
    let p = 0;
    for (let r = 0; r < rows; r++) {
      if (out[r][c] !== 0) p = out[r][c];
      out[r][c] = p;
    }
  }
  return out;
}

function propagateUp(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out = cloneGrid(grid);
  for (let c = 0; c < cols; c++) {
    let p = 0;
    for (let r = rows - 1; r >= 0; r--) {
      if (out[r][c] !== 0) p = out[r][c];
      out[r][c] = p;
    }
  }
  return out;
}

function rowNearestNonZeroFill(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    const row = out[r];
    const anchors: Array<{ c: number; v: number }> = [];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== 0) anchors.push({ c, v: row[c] });
    }
    if (anchors.length === 0) continue;

    for (let c = 0; c < row.length; c++) {
      let bestV = anchors[0].v;
      let bestAnchorC = anchors[0].c;
      let bestD = Math.abs(c - anchors[0].c);
      for (let i = 1; i < anchors.length; i++) {
        const d = Math.abs(c - anchors[i].c);
        if (d < bestD) {
          bestD = d;
          bestV = anchors[i].v;
          bestAnchorC = anchors[i].c;
        } else if (d === bestD) {
          // Tie-break: prefer leftmost anchor (smaller column index).
          if (anchors[i].c < bestAnchorC) {
            bestV = anchors[i].v;
            bestAnchorC = anchors[i].c;
          }
        }
      }
      row[c] = bestV;
    }
  }
  return out;
}

function modeOfNonZero(arr: number[]): number {
  const freq: Record<number, number> = {};
  let maxCount = 0;
  let mode = 0;
  for (const v of arr) {
    if (v === 0) continue;
    freq[v] = (freq[v] || 0) + 1;
    if (freq[v] > maxCount || (freq[v] === maxCount && mode === 0)) {
      maxCount = freq[v];
      mode = v;
    }
  }
  return mode;
}

function modeIncludingZero(arr: number[]): number {
  const freq: Record<number, number> = {};
  let best = arr[0] ?? 0;
  let bestCount = 0;
  for (const v of arr) {
    freq[v] = (freq[v] || 0) + 1;
    if (freq[v] > bestCount) {
      best = v;
      bestCount = freq[v];
    }
  }
  return best;
}

function modeOfNonZeroWithMinCount(arr: number[], minCount: number): number {
  const freq: Record<number, number> = {};
  for (const v of arr) {
    if (v === 0) continue;
    freq[v] = (freq[v] || 0) + 1;
  }
  let best = 0;
  let bestCount = 0;
  for (const [k, v] of Object.entries(freq)) {
    const val = Number(k);
    if (v >= minCount && v > bestCount) {
      best = val;
      bestCount = v;
    }
  }
  return best; // 0 if none meet threshold
}

function bottommostNonZero(arr: number[]): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== 0) return arr[i];
  }
  return 0;
}

function anchorColsModeGe2(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out: Grid = [];

  // Determine anchors per column: any non-zero that repeats in >=2 rows.
  const anchors: number[] = new Array(cols).fill(0);
  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    for (let r = 0; r < rows; r++) col.push(grid[r][c]);
    anchors[c] = modeOfNonZeroWithMinCount(col, 2);
  }

  // Broadcast anchors down all rows; everything else becomes 0.
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) row.push(anchors[c]);
    out.push(row);
  }
  return out;
}

function anchorColsBottomKeepFirstTwoLast(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  if (cols === 0) return grid.map(() => []);

  // Use the rightmost column that contains any non-zero (not necessarily the last column).
  // This is important for Phase-2 style test inputs where the literal last column may be empty.
  let rightmostNonZeroCol = -1;
  for (let c = cols - 1; c >= 0; c--) {
    let has = false;
    for (let r = 0; r < rows; r++) {
      if (grid[r][c] !== 0) { has = true; break; }
    }
    if (has) { rightmostNonZeroCol = c; break; }
  }
  const last = rightmostNonZeroCol >= 0 ? rightmostNonZeroCol : cols - 1;
  const anchors: number[] = new Array(cols).fill(0);

  // Keep only columns 0, 1, last. Use bottommost non-zero in those columns.
  for (const c of [0, 1, last]) {
    if (c < 0 || c >= cols) continue;
    const col: number[] = [];
    for (let r = 0; r < rows; r++) col.push(grid[r][c]);
    anchors[c] = bottommostNonZero(col);
  }

  const out: Grid = [];
  for (let r = 0; r < rows; r++) out.push([...anchors]);
  return out;
}

function fillLastTwoWithRightmostNonZero(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    const row = out[r];
    if (row.length < 2) continue;
    let v = 0;
    for (let c = row.length - 1; c >= 0; c--) {
      if (row[c] !== 0) { v = row[c]; break; }
    }
    if (v !== 0) {
      row[row.length - 2] = v;
      row[row.length - 1] = v;
    }
  }
  return out;
}

function maxOfNonZero(arr: number[]): number {
  let mx = 0;
  for (const v of arr) {
    if (v !== 0 && v > mx) mx = v;
  }
  return mx;
}

function fillColumnMode(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out = cloneGrid(grid);
  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    for (let r = 0; r < rows; r++) col.push(grid[r][c]);
    const mode = modeOfNonZero(col);
    if (mode !== 0) {
      for (let r = 0; r < rows; r++) out[r][c] = mode;
    }
  }
  return out;
}

function fillRowMode(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    const mode = modeOfNonZero(out[r]);
    if (mode !== 0) {
      for (let c = 0; c < out[r].length; c++) out[r][c] = mode;
    }
  }
  return out;
}

function fillRowMax(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    const mx = maxOfNonZero(out[r]);
    if (mx !== 0) {
      for (let c = 0; c < out[r].length; c++) out[r][c] = mx;
    }
  }
  return out;
}

function fillColumnMax(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out = cloneGrid(grid);
  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    for (let r = 0; r < rows; r++) col.push(grid[r][c]);
    const mx = maxOfNonZero(col);
    if (mx !== 0) {
      for (let r = 0; r < rows; r++) out[r][c] = mx;
    }
  }
  return out;
}

function tileMajorityRow(grid: Grid): Grid {
  if (grid.length === 0) return [];
  let bestRow = 0;
  let bestNonZero = 0;
  for (let r = 0; r < grid.length; r++) {
    const nz = grid[r].filter(v => v !== 0).length;
    if (nz > bestNonZero) { bestNonZero = nz; bestRow = r; }
  }
  return grid.map(() => [...grid[bestRow]]);
}

function tileMajorityCol(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  let bestCol = 0;
  let bestNonZero = 0;
  for (let c = 0; c < cols; c++) {
    let nz = 0;
    for (let r = 0; r < rows; r++) if (grid[r][c] !== 0) nz++;
    if (nz > bestNonZero) { bestNonZero = nz; bestCol = c; }
  }
  const out: Grid = [];
  for (let r = 0; r < rows; r++) {
    out.push(new Array(cols).fill(grid[r][bestCol]));
  }
  return out;
}

function transposeGrid(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out: Grid = [];
  for (let c = 0; c < cols; c++) {
    const row: number[] = [];
    for (let r = 0; r < rows; r++) row.push(grid[r][c]);
    out.push(row);
  }
  return out;
}

function rotateCW(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out: Grid = [];
  for (let c = 0; c < cols; c++) {
    const row: number[] = [];
    for (let r = rows - 1; r >= 0; r--) row.push(grid[r][c]);
    out.push(row);
  }
  return out;
}

function rotateCCW(grid: Grid): Grid {
  if (grid.length === 0) return [];
  const rows = grid.length;
  const cols = grid[0].length;
  const out: Grid = [];
  for (let c = cols - 1; c >= 0; c--) {
    const row: number[] = [];
    for (let r = 0; r < rows; r++) row.push(grid[r][c]);
    out.push(row);
  }
  return out;
}

function mirrorH(grid: Grid): Grid {
  return grid.map(row => [...row].reverse());
}

function mirrorV(grid: Grid): Grid {
  return [...grid].reverse().map(row => [...row]);
}

function stripZerosToValue(grid: Grid): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    const nonZero = out[r].filter(v => v !== 0);
    if (nonZero.length === 1) {
      for (let c = 0; c < out[r].length; c++) out[r][c] = nonZero[0];
    }
  }
  return out;
}

// ─── OBJECT PRIMITIVES (4-CONNECTED) ────────────────────────────

type Pt = { r: number; c: number };

function inBounds(grid: Grid, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < grid.length && c < (grid[0]?.length ?? 0);
}

function bboxOfPoints(points: Pt[]): { r0: number; c0: number; r1: number; c1: number } | null {
  if (points.length === 0) return null;
  let r0 = points[0].r, r1 = points[0].r, c0 = points[0].c, c1 = points[0].c;
  for (const p of points) {
    if (p.r < r0) r0 = p.r;
    if (p.r > r1) r1 = p.r;
    if (p.c < c0) c0 = p.c;
    if (p.c > c1) c1 = p.c;
  }
  return { r0, c0, r1, c1 };
}

function allNonZeroPoints(grid: Grid): Pt[] {
  const pts: Pt[] = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== 0) pts.push({ r, c });
    }
  }
  return pts;
}

function connectedComponents4(grid: Grid): Array<{ points: Pt[]; colors: number[] }> {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const seen = new Array(rows).fill(0).map(() => new Array(cols).fill(false));
  const comps: Array<{ points: Pt[]; colors: number[] }> = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (seen[r][c]) continue;
      if (grid[r][c] === 0) continue;
      seen[r][c] = true;
      const q: Pt[] = [{ r, c }];
      const pts: Pt[] = [];
      const colsSeen: number[] = [];
      while (q.length) {
        const cur = q.pop()!;
        pts.push(cur);
        colsSeen.push(grid[cur.r][cur.c]);
        for (const [dr, dc] of dirs) {
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (!inBounds(grid, nr, nc)) continue;
          if (seen[nr][nc]) continue;
          if (grid[nr][nc] === 0) continue;
          seen[nr][nc] = true;
          q.push({ r: nr, c: nc });
        }
      }
      comps.push({ points: pts, colors: colsSeen });
    }
  }
  return comps;
}

function keepLargestComponent4(grid: Grid): Grid {
  const out = grid.map((row) => row.map(() => 0));
  const comps = connectedComponents4(grid);
  if (comps.length === 0) return out;
  comps.sort((a, b) => b.points.length - a.points.length);
  const comp = comps[0];
  for (const p of comp.points) out[p.r][p.c] = grid[p.r][p.c];
  return out;
}

function keepKLargestComponents4(grid: Grid, k: number): Grid {
  const out = grid.map((row) => row.map(() => 0));
  const comps = connectedComponents4(grid);
  if (comps.length === 0) return out;
  comps.sort((a, b) => b.points.length - a.points.length);
  const keep = comps.slice(0, Math.max(1, Math.min(k, comps.length)));
  for (const comp of keep) {
    for (const p of comp.points) out[p.r][p.c] = grid[p.r][p.c];
  }
  return out;
}

function cropToBBox(grid: Grid, bbox: { r0: number; c0: number; r1: number; c1: number }): Grid {
  const out: Grid = [];
  for (let r = bbox.r0; r <= bbox.r1; r++) {
    out.push(grid[r].slice(bbox.c0, bbox.c1 + 1));
  }
  return out;
}

function cropToBBoxNonZero(grid: Grid): Grid {
  const pts = allNonZeroPoints(grid);
  const bb = bboxOfPoints(pts);
  if (!bb) return [[]];
  return cropToBBox(grid, bb);
}

function cropToBBoxLargestComponent4(grid: Grid): Grid {
  const comps = connectedComponents4(grid);
  if (comps.length === 0) return [[]];
  comps.sort((a, b) => b.points.length - a.points.length);
  const bb = bboxOfPoints(comps[0].points);
  if (!bb) return [[]];
  return cropToBBox(grid, bb);
}

function paintBBoxOnBlank(
  rows: number,
  cols: number,
  bbox: { r0: number; c0: number; r1: number; c1: number },
  color: number,
): Grid {
  const out: Grid = new Array(rows).fill(0).map(() => new Array(cols).fill(0));
  for (let r = bbox.r0; r <= bbox.r1; r++) {
    for (let c = bbox.c0; c <= bbox.c1; c++) out[r][c] = color;
  }
  return out;
}

function paintBBoxNonZeroOnBlank(grid: Grid): Grid {
  const pts = allNonZeroPoints(grid);
  const bb = bboxOfPoints(pts);
  if (!bb) return grid.map((row) => row.map(() => 0));
  const colors = pts.map((p) => grid[p.r][p.c]);
  const color = modeOfNonZero(colors);
  return paintBBoxOnBlank(grid.length, grid[0].length, bb, color || 1);
}

function paintBBoxLargestComponent4OnBlank(grid: Grid): Grid {
  const comps = connectedComponents4(grid);
  if (comps.length === 0) return grid.map((row) => row.map(() => 0));
  comps.sort((a, b) => b.points.length - a.points.length);
  const bb = bboxOfPoints(comps[0].points);
  if (!bb) return grid.map((row) => row.map(() => 0));
  const color = modeOfNonZero(comps[0].colors);
  return paintBBoxOnBlank(grid.length, grid[0].length, bb, color || 1);
}

function translatePointsToOrigin(grid: Grid, pts: Pt[]): Grid {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const out: Grid = new Array(rows).fill(0).map(() => new Array(cols).fill(0));
  const bb = bboxOfPoints(pts);
  if (!bb) return out;
  const dr = -bb.r0;
  const dc = -bb.c0;
  for (const p of pts) {
    const nr = p.r + dr;
    const nc = p.c + dc;
    if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) out[nr][nc] = grid[p.r][p.c];
  }
  return out;
}

function translateNonZeroToOrigin(grid: Grid): Grid {
  return translatePointsToOrigin(grid, allNonZeroPoints(grid));
}

function translateLargestComponent4ToOrigin(grid: Grid): Grid {
  const comps = connectedComponents4(grid);
  if (comps.length === 0) return grid.map((row) => row.map(() => 0));
  comps.sort((a, b) => b.points.length - a.points.length);
  return translatePointsToOrigin(grid, comps[0].points);
}

function borderValues(grid: Grid): number[] {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const vals: number[] = [];
  if (rows === 0 || cols === 0) return vals;
  for (let c = 0; c < cols; c++) vals.push(grid[0][c], grid[rows - 1][c]);
  for (let r = 1; r < rows - 1; r++) vals.push(grid[r][0], grid[r][cols - 1]);
  return vals;
}

function floodfillZerosFromOrigin(grid: Grid, fillColor: number): Grid {
  const out = cloneGrid(grid);
  if (out.length === 0 || out[0].length === 0) return out;
  if (out[0][0] !== 0) return out;
  const rows = out.length;
  const cols = out[0].length;
  const q: Pt[] = [{ r: 0, c: 0 }];
  out[0][0] = fillColor;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length) {
    const cur = q.pop()!;
    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (out[nr][nc] !== 0) continue;
      out[nr][nc] = fillColor;
      q.push({ r: nr, c: nc });
    }
  }
  return out;
}

function floodfillZerosFromOriginWithBorderMode(grid: Grid): Grid {
  const b = borderValues(grid);
  const fillColor = modeIncludingZero(b.filter((v) => v !== 0)) || 1;
  return floodfillZerosFromOrigin(grid, fillColor);
}

function floodfillZerosFromOriginWithNonZeroMode(grid: Grid): Grid {
  const pts = allNonZeroPoints(grid);
  const fillColor = pts.length ? modeOfNonZero(pts.map((p) => grid[p.r][p.c])) : 1;
  return floodfillZerosFromOrigin(grid, fillColor || 1);
}

function translateXY(grid: Grid, dx: number, dy: number): Grid {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const out: Grid = new Array(rows).fill(0).map(() => new Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      const nr = r + dy;
      const nc = c + dx;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      out[nr][nc] = v;
    }
  }
  return out;
}

function recolorReplace(grid: Grid, from: number, to: number): Grid {
  const out = cloneGrid(grid);
  for (let r = 0; r < out.length; r++) {
    for (let c = 0; c < out[r].length; c++) {
      if (out[r][c] === from) out[r][c] = to;
    }
  }
  return out;
}

// ─── PRIMITIVE DISPATCH ─────────────────────────────────────────

type PrimitiveExecutor = (g: Grid, args?: Record<string, number>) => Grid;

const EXECUTORS: Record<GridPrimitiveType, PrimitiveExecutor> = {
  identity: (g) => cloneGrid(g),
  propagate_right: (g) => propagateRight(g),
  propagate_left: (g) => propagateLeft(g),
  propagate_down: (g) => propagateDown(g),
  propagate_up: (g) => propagateUp(g),
  row_nearest_nonzero_fill: (g) => rowNearestNonZeroFill(g),
  anchor_cols_mode_ge2: (g) => anchorColsModeGe2(g),
  anchor_cols_bottom_keep_first_two_last: (g) => anchorColsBottomKeepFirstTwoLast(g),
  fill_last_two_with_rightmost_nonzero: (g) => fillLastTwoWithRightmostNonZero(g),
  translate_xy: (g, args) => translateXY(g, args?.dx ?? 0, args?.dy ?? 0),
  recolor_replace: (g, args) => recolorReplace(g, args?.from ?? 0, args?.to ?? 0),
  keep_k_largest_components_4: (g, args) => keepKLargestComponents4(g, args?.k ?? 1),
  keep_largest_component_4: (g) => keepLargestComponent4(g),
  crop_to_bbox_nonzero: (g) => cropToBBoxNonZero(g),
  crop_to_bbox_largest_component_4: (g) => cropToBBoxLargestComponent4(g),
  paint_bbox_nonzero_on_blank: (g) => paintBBoxNonZeroOnBlank(g),
  paint_bbox_largest_component_4_on_blank: (g) => paintBBoxLargestComponent4OnBlank(g),
  translate_nonzero_to_origin: (g) => translateNonZeroToOrigin(g),
  translate_largest_component_4_to_origin: (g) => translateLargestComponent4ToOrigin(g),
  floodfill_zeros_from_origin_with_border_mode: (g) => floodfillZerosFromOriginWithBorderMode(g),
  floodfill_zeros_from_origin_with_nonzero_mode: (g) => floodfillZerosFromOriginWithNonZeroMode(g),
  fill_column_mode: (g) => fillColumnMode(g),
  fill_row_mode: (g) => fillRowMode(g),
  fill_row_max: (g) => fillRowMax(g),
  fill_column_max: (g) => fillColumnMax(g),
  tile_majority_row: (g) => tileMajorityRow(g),
  tile_majority_col: (g) => tileMajorityCol(g),
  transpose: (g) => transposeGrid(g),
  rotate_cw: (g) => rotateCW(g),
  rotate_ccw: (g) => rotateCCW(g),
  mirror_h: (g) => mirrorH(g),
  mirror_v: (g) => mirrorV(g),
  strip_zeros_to_value: (g) => stripZerosToValue(g),
};

// ─── PROGRAM EXECUTION ─────────────────────────────────────────
// Execute a program (sequence of primitives) on a grid.
// Pure pipeline: grid → p1 → p2 → ... → pN → result

export function executeProgram(grid: Grid, program: GridProgram): Grid {
  let current = cloneGrid(grid);
  const steps = program.steps && program.steps.length > 0
    ? program.steps
    : (program.primitives || []).map((p) => ({ prim: p as GridPrimitiveType, args: undefined }));
  for (const step of steps) {
    const executor = EXECUTORS[step.prim];
    if (!executor) return current;
    current = executor(current, step.args);
  }
  return current;
}

// ─── SEARCH / PRUNING ENGINE ────────────────────────────────────
// Brute enumeration explodes once we add object primitives.
// This is a bounded program induction engine:
// - incremental deepening
// - beam search (fail-fast + low diff + low MDL)
// - output-signature dedupe (observational equivalence)
// - memoized primitive execution (pure functions → cacheable)

type CachedExec = { grid: Grid; hash: string };

// Global in-memory caches (per renderer process lifetime).
// These are intentionally capped to avoid unbounded growth.
const GLOBAL_EXEC_CACHE = new Map<string, CachedExec>();
const GLOBAL_EXEC_CACHE_MAX = 50_000;

type TaskCacheEntry = {
  lockedProgram: GridProgram | null;
  lockedProgramLabel: string;
  survivorCount: number;
  // We keep a small summary only; detailed candidates are recomputed if needed.
};
const TASK_CACHE = new Map<string, TaskCacheEntry>();
const TASK_CACHE_MAX = 500;

function lruSet<K, V>(m: Map<K, V>, k: K, v: V, max: number) {
  if (m.has(k)) m.delete(k);
  m.set(k, v);
  if (m.size <= max) return;
  const firstKey = m.keys().next().value as K | undefined;
  if (firstKey !== undefined) m.delete(firstKey);
}

function taskSignature(pairs: TrainingPair[]): string {
  // Order-sensitive signature: changing example order changes signature,
  // which is fine for caching. It's still deterministic.
  const parts: string[] = [];
  for (const p of pairs) {
    parts.push(`${hashGrid(p.input)}>${hashGrid(p.output)}`);
  }
  return fnv1a32(parts.join('|'));
}

function applyPrimitiveCached(
  prim: GridPrimitiveType,
  args: Record<string, number> | undefined,
  input: Grid,
  execCache: Map<string, CachedExec>,
): CachedExec {
  const inHash = hashGrid(input);
  const argKey = args
    ? Object.keys(args).sort().map((k) => `${k}=${args[k]}`).join(',')
    : '';
  const key = `${prim}(${argKey}):${inHash}`;
  const hit = execCache.get(key) || GLOBAL_EXEC_CACHE.get(key);
  if (hit) return hit;
  const executor = EXECUTORS[prim];
  const out = executor ? executor(input, args) : cloneGrid(input);
  const outHash = hashGrid(out);
  const entry = { grid: out, hash: outHash };
  execCache.set(key, entry);
  lruSet(GLOBAL_EXEC_CACHE, key, entry, GLOBAL_EXEC_CACHE_MAX);
  return entry;
}

type GridStep = { prim: GridPrimitiveType; args?: Record<string, number> };

type SearchNode = {
  id: string;
  steps: GridStep[];
  complexity: number;
  label: string;
  outputs: Grid[];      // one per training pair input
  outputHashes: string[]; // one per training pair input
  passCount: number;
  failedPairs: number[];
  totalDiff: number;
  signature: string; // outputHashes joined
};

type PIESearchOptions = {
  maxDepth: number;
  maxComplexity: number;
  beamWidth: number;
  stopAtFirstDepthWithSurvivor: boolean;
  maxExpansions: number;
  timeBudgetMs: number;
};

const DEFAULT_SEARCH: PIESearchOptions = {
  maxDepth: 4,
  maxComplexity: 9,
  beamWidth: 450,
  stopAtFirstDepthWithSurvivor: true,
  maxExpansions: 10_000,
  timeBudgetMs: 350,
};

let PIE_SEARCH_DEFAULTS: PIESearchOptions = { ...DEFAULT_SEARCH };

export function getPIESearchDefaults(): PIESearchOptions {
  return { ...PIE_SEARCH_DEFAULTS };
}

export function setPIESearchDefaults(next: Partial<PIESearchOptions>) {
  PIE_SEARCH_DEFAULTS = {
    ...PIE_SEARCH_DEFAULTS,
    ...next,
  };
}

function scoreNode(a: SearchNode): [number, number, number, number] {
  // Sort key: fewer failures → lower diff → lower complexity → shorter program.
  return [a.failedPairs.length, a.totalDiff, a.complexity, a.steps.length];
}

function compareScore(a: SearchNode, b: SearchNode): number {
  const sa = scoreNode(a);
  const sb = scoreNode(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] - sb[i];
  }
  return a.label.localeCompare(b.label);
}

function stepLabel(step: GridStep): string {
  if (!step.args || Object.keys(step.args).length === 0) return primitiveLabel(step.prim);
  const args = Object.keys(step.args).sort().map((k) => `${k}=${step.args![k]}`).join(',');
  return `${primitiveLabel(step.prim)}(${args})`;
}

function buildNode(
  steps: GridStep[],
  outputs: Grid[],
  outputHashes: string[],
  pairs: TrainingPair[],
  complexity: number,
): SearchNode {
  const failedPairs: number[] = [];
  let passCount = 0;
  let totalDiff = 0;
  for (let i = 0; i < pairs.length; i++) {
    const ok = gridsEqual(outputs[i], pairs[i].output);
    if (ok) passCount++;
    else failedPairs.push(i);
    totalDiff += ok ? 0 : gridDiffCount(outputs[i], pairs[i].output);
  }
  const signature = outputHashes.join('|');
  return {
    id: programId(),
    steps,
    complexity,
    label: steps.length ? steps.map(stepLabel).join(' → ') : 'identity',
    outputs,
    outputHashes,
    passCount,
    failedPairs,
    totalDiff,
    signature,
  };
}

function searchPrograms(
  pairs: TrainingPair[],
  opts: PIESearchOptions,
): {
  bestFrontier: SearchNode[];
  survivors: SearchNode[];
  expansions: number;
} {
  const startedAt = Date.now();
  // Build a task-specific step space for parameterized primitives.
  const palette = new Set<number>();
  const inPalette = new Set<number>();
  const outPalette = new Set<number>();
  for (const p of pairs) {
    for (const row of p.input) for (const v of row) if (v !== 0) { palette.add(v); inPalette.add(v); }
    for (const row of p.output) for (const v of row) if (v !== 0) { palette.add(v); outPalette.add(v); }
  }
  const colors = [...palette].slice(0, 12);
  const palettesDiffer = (() => {
    if (inPalette.size !== outPalette.size) return true;
    for (const v of inPalette) if (!outPalette.has(v)) return true;
    return false;
  })();

  const baseSteps: GridStep[] = [];
  for (const prim of [...SINGLE_PRIMITIVES, ...STRUCTURAL_PRIMITIVES]) {
    // Expand parameter variants.
    if (prim === 'translate_xy') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          baseSteps.push({ prim, args: { dx, dy } });
        }
      }
      continue;
    }
    if (prim === 'keep_k_largest_components_4') {
      for (const k of [1, 2, 3]) baseSteps.push({ prim, args: { k } });
      continue;
    }
    if (prim === 'recolor_replace') {
      if (!palettesDiffer || colors.length > 6) continue;
      // Limit combinatorics: enumerate a bounded set of recolor swaps.
      // Prefer replacements to 0 (erase) and pairwise swaps among observed colors.
      const variants: GridStep[] = [];
      for (const from of colors) variants.push({ prim, args: { from, to: 0 } });
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          variants.push({ prim, args: { from: colors[i], to: colors[j] } });
          variants.push({ prim, args: { from: colors[j], to: colors[i] } });
        }
      }
      for (const v of variants.slice(0, 40)) baseSteps.push(v);
      continue;
    }
    baseSteps.push({ prim });
  }

  const execCache = new Map<string, CachedExec>();
  const expansionsCounter = { n: 0 };

  // Start from identity program.
  const initOutputs = pairs.map((p) => cloneGrid(p.input));
  const initHashes = initOutputs.map((g) => hashGrid(g));
  let frontier: SearchNode[] = [buildNode([], initOutputs, initHashes, pairs, 0)];
  let survivors: SearchNode[] = [];

  // Global dedupe: keep only the best node per observational signature.
  const bestBySignature = new Map<string, SearchNode>();
  bestBySignature.set(frontier[0].signature, frontier[0]);

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const nextMap = new Map<string, SearchNode>();
    const nextAll: SearchNode[] = [];

    // Gate the step space early to avoid paying for heavy object ops too soon.
    // Depth 1: allow cheap (≤2). Depth 2: allow moderate (≤3). Later: full space.
    const maxStepCostThisDepth = depth === 1 ? 2 : depth === 2 ? 3 : 999;
    const stepsThisDepth = baseSteps.filter((s) => PRIMITIVE_COMPLEXITY[s.prim] <= maxStepCostThisDepth);

    for (const node of frontier) {
      for (const step of stepsThisDepth) {
        if (Date.now() - startedAt > opts.timeBudgetMs) break;
        const newComplexity = node.complexity + PRIMITIVE_COMPLEXITY[step.prim];
        if (newComplexity > opts.maxComplexity) continue;

        // Simple redundancy prune: avoid repeating the same primitive back-to-back
        const prev = node.steps[node.steps.length - 1]?.prim;
        if (prev === step.prim && !['transpose', 'rotate_cw', 'rotate_ccw'].includes(step.prim)) continue;

        const newOutputs: Grid[] = [];
        const newHashes: string[] = [];
        for (let i = 0; i < node.outputs.length; i++) {
          const r = applyPrimitiveCached(step.prim, step.args, node.outputs[i], execCache);
          newOutputs.push(r.grid);
          newHashes.push(r.hash);
        }

        const newSteps = [...node.steps, step];
        const cand = buildNode(newSteps, newOutputs, newHashes, pairs, newComplexity);
        expansionsCounter.n++;
        if (expansionsCounter.n >= opts.maxExpansions) break;

        // Global signature dedupe (observational equivalence)
        const existingGlobal = bestBySignature.get(cand.signature);
        if (existingGlobal) {
          // Keep the best (lower score).
          if (compareScore(cand, existingGlobal) >= 0) continue;
        }
        bestBySignature.set(cand.signature, cand);

        // Depth-local signature dedupe
        const existing = nextMap.get(cand.signature);
        if (!existing || compareScore(cand, existing) < 0) {
          nextMap.set(cand.signature, cand);
        }
      }
      if (expansionsCounter.n >= opts.maxExpansions) break;
      if (Date.now() - startedAt > opts.timeBudgetMs) break;
    }
    if (Date.now() - startedAt > opts.timeBudgetMs) break;
    if (expansionsCounter.n >= opts.maxExpansions) break;

    for (const v of nextMap.values()) nextAll.push(v);
    nextAll.sort(compareScore);

    // Collect survivors at this depth.
    const depthSurvivors = nextAll.filter((n) => n.failedPairs.length === 0);
    if (depthSurvivors.length > 0) {
      survivors = depthSurvivors;
      if (opts.stopAtFirstDepthWithSurvivor) {
        frontier = nextAll.slice(0, opts.beamWidth);
        break;
      }
    }

    // Beam
    frontier = nextAll.slice(0, opts.beamWidth);

    if (frontier.length === 0) break;
  }

  return {
    bestFrontier: frontier,
    survivors,
    expansions: expansionsCounter.n,
  };
}

// ─── PROGRAM ENUMERATION ────────────────────────────────────────
// Generate candidate programs up to a given complexity budget.
// Single primitives first (depth 1), then compositions (depth 2).
// This is the search space AGI PRIME was missing.

let _programCounter = 0;
function programId(): string {
  return `PIE-P${++_programCounter}`;
}

const SINGLE_PRIMITIVES: GridPrimitiveType[] = [
  'propagate_right',
  'propagate_left',
  'propagate_down',
  'propagate_up',
  'row_nearest_nonzero_fill',
  'anchor_cols_mode_ge2',
  'anchor_cols_bottom_keep_first_two_last',
  'fill_last_two_with_rightmost_nonzero',
  'translate_xy',
  'recolor_replace',
  'keep_k_largest_components_4',
  'keep_largest_component_4',
  'crop_to_bbox_nonzero',
  'crop_to_bbox_largest_component_4',
  'paint_bbox_nonzero_on_blank',
  'paint_bbox_largest_component_4_on_blank',
  'translate_nonzero_to_origin',
  'translate_largest_component_4_to_origin',
  'floodfill_zeros_from_origin_with_border_mode',
  'floodfill_zeros_from_origin_with_nonzero_mode',
  'fill_column_mode',
  'fill_row_mode',
  'fill_row_max',
  'fill_column_max',
  'tile_majority_row',
  'tile_majority_col',
  'strip_zeros_to_value',
];

const STRUCTURAL_PRIMITIVES: GridPrimitiveType[] = [
  'transpose',
  'rotate_cw',
  'rotate_ccw',
  'mirror_h',
  'mirror_v',
];

function primitiveLabel(p: GridPrimitiveType): string {
  return p.replace(/_/g, ' ');
}

export function enumeratePrograms(maxDepth: number = 2, maxComplexity: number = 6): GridProgram[] {
  const programs: GridProgram[] = [];
  const base = [...SINGLE_PRIMITIVES, ...STRUCTURAL_PRIMITIVES];

  // Recursive enumeration with pruning by maxComplexity.
  const walk = (prefix: GridPrimitiveType[], cost: number, depth: number) => {
    if (depth === 0) return;
    for (const p of base) {
      const newCost = cost + PRIMITIVE_COMPLEXITY[p];
      if (newCost > maxComplexity) continue;

      // Prune some trivial redundancies.
      const prev = prefix[prefix.length - 1];
      if (prev === p && !['transpose', 'rotate_cw', 'rotate_ccw'].includes(p)) continue;

      const next = [...prefix, p];
      programs.push({
        id: programId(),
        primitives: next,
        complexity: newCost,
        label: next.map(primitiveLabel).join(' → '),
      });

      walk(next, newCost, depth - 1);
    }
  };

  walk([], 0, maxDepth);
  return programs;
}

// ─── PARALLEL FALSIFICATION ─────────────────────────────────────
// The core of PIE. Run every candidate on every training pair.
// No LLM. No narrative. Pure tensor comparison.

export function falsifyProgram(
  program: GridProgram,
  pairs: TrainingPair[],
  stopOnFirstFailure: boolean = true,
): FalsificationResult[] {
  const results: FalsificationResult[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const actual = executeProgram(pairs[i].input, program);
    const passed = gridsEqual(actual, pairs[i].output);
    const diff = passed ? 0 : gridDiffCount(actual, pairs[i].output);
    results.push({
      programId: program.id,
      pairIndex: i,
      input: pairs[i].input,
      expected: pairs[i].output,
      actual,
      passed,
      diff,
      diffSamples: passed ? undefined : sampleGridDiffs(actual, pairs[i].output, 8),
    });
    if (stopOnFirstFailure && !passed) break;
  }
  return results;
}

export function runParallelFalsification(
  programs: GridProgram[],
  pairs: TrainingPair[],
): ProgramCandidate[] {
  const candidates: ProgramCandidate[] = [];

  for (const program of programs) {
    const falsifications = falsifyProgram(program, pairs, true);
    // If we early-exit, passCount is either totalPairs (survivor) or < totalPairs (eliminated).
    const passCount = falsifications.filter((f) => f.passed).length;
    const failedPairs = falsifications.filter((f) => !f.passed).map((f) => f.pairIndex);

    candidates.push({
      id: program.id,
      program,
      passCount,
      totalPairs: pairs.length,
      failedPairs,
      falsifications,
      eliminated: passCount < pairs.length,
      eliminationReason: passCount < pairs.length
        ? `Failed ${pairs.length - passCount}/${pairs.length} pairs (indices: ${failedPairs.join(',')})`
        : undefined,
    });
  }

  return candidates;
}

// ─── MDL SELECTION ──────────────────────────────────────────────
// Among survivors, select the program with lowest complexity.
// This IS Occam's Razor — not described, but executed.

export function selectMinimalProgram(survivors: ProgramCandidate[]): ProgramCandidate | null {
  if (survivors.length === 0) return null;

  const sorted = [...survivors].sort((a, b) => {
    if (a.program.complexity !== b.program.complexity) return a.program.complexity - b.program.complexity;
    return a.program.primitives.length - b.program.primitives.length;
  });

  return sorted[0];
}

export function selectLockedProgram(
  survivors: ProgramCandidate[],
  pairs: TrainingPair[],
): ProgramCandidate | null {
  if (survivors.length === 0) return null;

  // First rank by MDL; then among the MDL-frontier, prefer the most robust
  // under systematic adversarial transforms (commutativity tests where possible).
  const sorted = [...survivors].sort((a, b) => {
    if (a.program.complexity !== b.program.complexity) return a.program.complexity - b.program.complexity;
    return a.program.primitives.length - b.program.primitives.length;
  });

  const topK = sorted.slice(0, 40);
  let best = topK[0];
  let bestAdv = -1;

  for (const cand of topK) {
    const adv = generateAdversarialTests(pairs, cand.program);
    const passed = adv.filter((t) => t.programStillValid).length;
    if (passed > bestAdv) {
      bestAdv = passed;
      best = cand;
    } else if (passed === bestAdv) {
      // Tie-break back to MDL.
      if (cand.program.complexity < best.program.complexity) best = cand;
    }
  }

  return best;
}

// ─── ADVERSARIAL GENERATOR ──────────────────────────────────────
// Generate stress-test inputs to probe program robustness.
// These are systematic, not LLM-generated.

export function generateAdversarialTests(
  basePairs: TrainingPair[],
  lockedProgram: GridProgram,
): AdversarialTest[] {
  const tests: AdversarialTest[] = [];
  if (basePairs.length === 0) return tests;

  const baseInput = basePairs[0].input;
  if (baseInput.length === 0) return tests;

  // 1. Rotation: rotate input CW
  const rotated = rotateCW(baseInput);
  const rotResult = executeProgram(rotated, lockedProgram);
  const rotExpected = rotateCW(basePairs[0].output);
  tests.push({
    type: 'rotation',
    input: rotated,
    description: 'CW rotation of example 1',
    programStillValid: gridsEqual(rotResult, rotExpected),
  });

  // 2. Noise injection: add random non-zero values to zero cells
  const noisy = cloneGrid(baseInput);
  let injected = false;
  for (let r = 0; r < noisy.length && !injected; r++) {
    for (let c = 0; c < noisy[r].length && !injected; c++) {
      if (noisy[r][c] === 0) {
        noisy[r][c] = 9;
        injected = true;
      }
    }
  }
  if (injected) {
    const noisyResult = executeProgram(noisy, lockedProgram);
    tests.push({
      type: 'noise_injection',
      input: noisy,
      description: 'Injected 9 into first zero cell of example 1',
      programStillValid: noisyResult.length === basePairs[0].output.length,
    });
  }

  // 3. Scale: double the grid by repeating rows
  const scaled: Grid = [];
  for (const row of baseInput) {
    scaled.push([...row]);
    scaled.push([...row]);
  }
  const scaledResult = executeProgram(scaled, lockedProgram);
  const scaledExpected: Grid = [];
  for (const row of basePairs[0].output) {
    scaledExpected.push([...row]);
    scaledExpected.push([...row]);
  }
  tests.push({
    type: 'scale',
    input: scaled,
    description: 'Doubled rows of example 1',
    programStillValid: gridsEqual(scaledResult, scaledExpected),
  });

  // 4. Value swap: swap two non-zero values
  const swapped = cloneGrid(baseInput);
  const vals = new Set<number>();
  for (const row of swapped) for (const v of row) if (v !== 0) vals.add(v);
  const valArr = [...vals];
  if (valArr.length >= 2) {
    const [v1, v2] = valArr;
    for (let r = 0; r < swapped.length; r++) {
      for (let c = 0; c < swapped[r].length; c++) {
        if (swapped[r][c] === v1) swapped[r][c] = v2;
        else if (swapped[r][c] === v2) swapped[r][c] = v1;
      }
    }
    const swapExpected = cloneGrid(basePairs[0].output);
    for (let r = 0; r < swapExpected.length; r++) {
      for (let c = 0; c < swapExpected[r].length; c++) {
        if (swapExpected[r][c] === v1) swapExpected[r][c] = v2;
        else if (swapExpected[r][c] === v2) swapExpected[r][c] = v1;
      }
    }
    const swapResult = executeProgram(swapped, lockedProgram);
    tests.push({
      type: 'value_swap',
      input: swapped,
      description: `Swapped values ${v1} ↔ ${v2} in example 1`,
      programStillValid: gridsEqual(swapResult, swapExpected),
    });
  }

  // 5. Row permutation: shuffle rows
  if (baseInput.length >= 2) {
    const permuted = cloneGrid(baseInput);
    const tmp = permuted[0];
    permuted[0] = permuted[permuted.length - 1];
    permuted[permuted.length - 1] = tmp;
    const permResult = executeProgram(permuted, lockedProgram);
    tests.push({
      type: 'row_permutation',
      input: permuted,
      description: 'Swapped first and last row of example 1',
      programStillValid: permResult.length === basePairs[0].output.length,
    });
  }

  // 6. Column permutation: shuffle columns
  if (baseInput[0] && baseInput[0].length >= 2) {
    const colPerm = cloneGrid(baseInput);
    for (const row of colPerm) {
      const tmp = row[0];
      row[0] = row[row.length - 1];
      row[row.length - 1] = tmp;
    }
    const colPermResult = executeProgram(colPerm, lockedProgram);
    const colPermExpected = cloneGrid(basePairs[0].output);
    for (const row of colPermExpected) {
      const tmp = row[0];
      row[0] = row[row.length - 1];
      row[row.length - 1] = tmp;
    }
    tests.push({
      type: 'col_permutation',
      input: colPerm,
      description: 'Swapped first and last column of example 1',
      programStillValid: gridsEqual(colPermResult, colPermExpected),
    });
  }

  return tests;
}

// ─── FULL PIE PIPELINE ──────────────────────────────────────────
// The complete "Silent Execution First" protocol.
// Returns: locked program + full falsification evidence.

export interface PIERunResult {
  candidates: ProgramCandidate[];
  survivors: ProgramCandidate[];
  lockedProgram: GridProgram | null;
  lockedProgramLabel: string;
  adversarialTests: AdversarialTest[];
  testOutput: Grid | null;
  totalProgramsTested: number;
  eliminatedCount: number;
  survivorCount: number;
  summary: string;
}

export interface PIEBenchReport {
  solved: number;
  total: number;
  avgMs: number;
  robustnessPassRate: number;
  score: number; // 0-1 composite
  details: Array<{
    taskId: string;
    solved: boolean;
    ms: number;
    expansions: number;
    lockedLabel: string;
  }>;
}

export function runPIEBenchmarkSuite(overrides?: Partial<PIESearchOptions>): PIEBenchReport {
  const details: PIEBenchReport['details'] = [];
  let solved = 0;
  let totalMs = 0;
  let total = PIE_BENCH_SUITE.length;
  let advPass = 0;
  let advTotal = 0;

  const prevDefaults = getPIESearchDefaults();
  if (overrides) setPIESearchDefaults(overrides);

  for (const task of PIE_BENCH_SUITE) {
    const t0 = Date.now();
    const r = runPIE(task.trainingPairs, task.testInput);
    const ms = Date.now() - t0;
    totalMs += ms;
    const ok = !!(r.testOutput && gridsEqual(r.testOutput, task.expectedTestOutput));
    if (ok) solved += 1;
    for (const t of r.adversarialTests) {
      advTotal += 1;
      if (t.programStillValid) advPass += 1;
    }
    details.push({
      taskId: task.id,
      solved: ok,
      ms,
      expansions: r.totalProgramsTested,
      lockedLabel: r.lockedProgramLabel,
    });
  }

  const avgMs = total > 0 ? totalMs / total : 0;
  const robustnessPassRate = advTotal > 0 ? advPass / advTotal : 0;
  const solveRate = total > 0 ? solved / total : 0;

  // Composite score: solve dominates; speed and robustness are secondary.
  const speedScore = avgMs <= 50 ? 1 : avgMs >= 600 ? 0 : 1 - (avgMs - 50) / 550;
  const score = Math.max(0, Math.min(1, solveRate * 0.75 + robustnessPassRate * 0.15 + speedScore * 0.10));

  // Restore caller defaults.
  setPIESearchDefaults(prevDefaults);
  return { solved, total, avgMs, robustnessPassRate, score, details };
}

export function runPIE(
  trainingPairs: TrainingPair[],
  testInput?: Grid,
  maxDepth: number = 4,
): PIERunResult {
  // Fast path: if we've already locked a program for the same task signature,
  // reuse it. This prevents repeated heavy searches in chat loops.
  const sig = taskSignature(trainingPairs);
  const cached = TASK_CACHE.get(sig);
  if (cached && cached.lockedProgram) {
    const testOutput = testInput ? executeProgram(testInput, cached.lockedProgram) : null;
    const adversarialTests = generateAdversarialTests(trainingPairs, cached.lockedProgram);
    const summary = [
      `PIE(cache): reused locked program for task ${sig}.`,
      `Locked: "${cached.lockedProgramLabel}" (complexity=${cached.lockedProgram.complexity}).`,
      `Adversarial: ${adversarialTests.filter(t => t.programStillValid).length}/${adversarialTests.length} tests passed.`,
      testOutput ? `Test output: [${testOutput.map(r => r.join(',')).join(' | ')}]` : '',
    ].filter(Boolean).join('\n');
    return {
      candidates: [],
      survivors: [],
      lockedProgram: cached.lockedProgram,
      lockedProgramLabel: cached.lockedProgramLabel,
      adversarialTests,
      testOutput,
      totalProgramsTested: 0,
      eliminatedCount: 0,
      survivorCount: cached.survivorCount,
      summary,
    };
  }

  // 1. SEARCH — incremental deepening with pruning + memoization
  const search = searchPrograms(trainingPairs, {
    ...PIE_SEARCH_DEFAULTS,
    maxDepth,
  });

  // Convert search nodes to ProgramCandidate (for UI/telemetry).
  // We only materialize falsification evidence for a small subset (top frontier + survivors).
  const nodesForEvidence = [
    ...search.survivors.slice(0, 50),
    ...search.bestFrontier.slice(0, 50),
  ];

  const nodeToCandidate = (n: SearchNode): ProgramCandidate => {
    const program: GridProgram = {
      id: n.id,
      primitives: n.steps.map((s) => s.prim),
      steps: n.steps,
      complexity: n.complexity,
      label: n.label || (n.steps.length ? n.steps.map(stepLabel).join(' → ') : 'identity'),
    };
    const falsifications = falsifyProgram(program, trainingPairs, true);
    const passCount = falsifications.filter((f) => f.passed).length;
    const failedPairs = falsifications.filter((f) => !f.passed).map((f) => f.pairIndex);
    return {
      id: program.id,
      program,
      passCount,
      totalPairs: trainingPairs.length,
      failedPairs,
      falsifications,
      eliminated: passCount < trainingPairs.length,
      eliminationReason: passCount < trainingPairs.length
        ? `Failed ${trainingPairs.length - passCount}/${trainingPairs.length} pairs (indices: ${failedPairs.join(',')})`
        : undefined,
    };
  };

  const candidates = nodesForEvidence.map(nodeToCandidate);
  const survivors = search.survivors.map(nodeToCandidate).filter((c) => !c.eliminated);

  // 2. SELECT — pick the minimal sufficient program (MDL), then prefer robustness
  const locked = selectLockedProgram(survivors, trainingPairs);
  lruSet(
    TASK_CACHE,
    sig,
    {
      lockedProgram: locked?.program ?? null,
      lockedProgramLabel: locked?.program.label ?? 'NONE',
      survivorCount: survivors.length,
    },
    TASK_CACHE_MAX,
  );

  // 5. ADVERSARIAL — stress-test the locked program
  const adversarialTests = locked
    ? generateAdversarialTests(trainingPairs, locked.program)
    : [];

  // 6. EXECUTE — run locked program on test input
  const testOutput = locked && testInput
    ? executeProgram(testInput, locked.program)
    : null;

  // 7. SUMMARIZE — no narrative, just facts
  const eliminated = candidates.filter(c => c.eliminated);
  const summary = locked
    ? [
        `PIE: ${search.expansions} expansions evaluated, ${eliminated.length} eliminated (evidence set), ${survivors.length} survived.`,
        `Locked: "${locked.program.label}" (complexity=${locked.program.complexity}, MDL rank≈top).`,
        `Adversarial: ${adversarialTests.filter(t => t.programStillValid).length}/${adversarialTests.length} tests passed.`,
        testOutput ? `Test output: [${testOutput.map(r => r.join(',')).join(' | ')}]` : '',
      ].filter(Boolean).join('\n')
    : `PIE: ${search.expansions} expansions evaluated, 0 survivors. No program in the DSL explains all training pairs.`;

  return {
    candidates,
    survivors,
    lockedProgram: locked?.program ?? null,
    lockedProgramLabel: locked?.program.label ?? 'NONE',
    adversarialTests,
    testOutput,
    totalProgramsTested: search.expansions,
    eliminatedCount: eliminated.length,
    survivorCount: survivors.length,
    summary,
  };
}

// ─── GRID PARSING ───────────────────────────────────────────────
// Parse grid strings from natural language / chat messages.
// Handles formats like "0 2 0\n0 2 0" or "[[0,2,0],[0,2,0]]"

export function parseGrid(text: string): Grid | null {
  const trimmed = text.trim();

  // Try JSON array format
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every(row => Array.isArray(row) && row.every((v: unknown) => typeof v === 'number'))) {
        return parsed as Grid;
      }
    } catch { /* fall through */ }
  }

  // Try space-separated rows (newline delimited)
  const lines = trimmed.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  const grid: Grid = [];
  for (const line of lines) {
    const nums = line.split(/[\s,]+/).map(Number);
    if (nums.some(isNaN)) return null;
    grid.push(nums);
  }

  // Validate rectangular
  const cols = grid[0].length;
  if (!grid.every(row => row.length === cols)) return null;

  return grid;
}

export function gridToString(grid: Grid): string {
  return grid.map(row => row.join(' ')).join('\n');
}

// ─── ARC TASK DETECTION ─────────────────────────────────────────
// Detect whether a message contains ARC-style training pairs.
// Returns parsed pairs if found.

export interface DetectedARCTask {
  trainingPairs: TrainingPair[];
  testInput: Grid | null;
}

export function detectARCTask(message: string): DetectedARCTask | null {
  const pairs: TrainingPair[] = [];

  // Look for Input:/Output: blocks
  const inputOutputPattern = /Input:\s*\n([\d\s\n]+?)(?:\n\s*\n|\nOutput:)/gi;
  const outputPattern = /Output:\s*\n([\d\s\n]+?)(?:\n\s*(?:\n|Example|Input:|PHASE|$))/gi;

  // Simpler approach: split by "Example" or "Input/Output" markers
  const sections = message.split(/(?:Example\s*\d+|PHASE\s*\d+)/i);

  for (const section of sections) {
    const inputMatch = section.match(/Input:\s*\n((?:\d[\d\s]*\n?)+)/i);
    const outputMatch = section.match(/Output:\s*\n((?:\d[\d\s]*\n?)+)/i);

    if (inputMatch && outputMatch) {
      const input = parseGrid(inputMatch[1]);
      const output = parseGrid(outputMatch[1]);
      if (input && output) {
        pairs.push({ input, output });
      }
    }
  }

  if (pairs.length === 0) return null;

  // Look for a standalone test input (Input: with no Output:)
  let testInput: Grid | null = null;
  const testSection = message.split(/PHASE\s*2/i).pop();
  if (testSection) {
    const testMatch = testSection.match(/Input:\s*\n((?:\d[\d\s]*\n?)+)/i);
    if (testMatch) {
      const candidate = parseGrid(testMatch[1]);
      if (candidate && !pairs.some(p => gridsEqual(p.input, candidate))) {
        testInput = candidate;
      }
    }
  }

  return { trainingPairs: pairs, testInput };
}

// ─── DEFAULT STATE ──────────────────────────────────────────────

export function createDefaultPIEState(): PIEState {
  return {
    active: false,
    trainingPairs: [],
    candidates: [],
    survivors: [],
    lockedProgram: null,
    lockedProgramLabel: '',
    falsificationLog: [],
    adversarialTests: [],
    totalRuns: 0,
    lastRunAt: 0,
    autoTuneEnabled: true,
    lastAutoTuneAt: 0,
    lastAutoTuneScore: 0,
    lastAutoTuneNotes: [],
  };
}

// ─── FORMAT FOR CHAT CONTEXT ────────────────────────────────────
// Inject PIE results into the LLM context so it can explain
// the *already-verified* program instead of narrating hypotheses.

export function formatPIEContext(state: PIEState): string {
  if (!state.active || !state.lockedProgram) return '';

  const lines: string[] = [
    '═══ PIE ENGINE (Parallel Invariant Engine) — ACTIVE ═══',
    `Locked Program: "${state.lockedProgramLabel}"`,
    `Primitives: [${state.lockedProgram.primitives.join(' → ')}]`,
    `MDL Complexity: ${state.lockedProgram.complexity}`,
    `Training Pairs Tested: ${state.trainingPairs.length}`,
    `Programs Enumerated: ${state.candidates.length}`,
    `Survivors: ${state.survivors.length}`,
    `Adversarial Tests: ${state.adversarialTests.filter(t => t.programStillValid).length}/${state.adversarialTests.length} passed`,
  ];

  if (state.survivors.length > 1) {
    lines.push('');
    lines.push('Other surviving programs (less minimal):');
    for (const s of state.survivors.slice(1, 5)) {
      lines.push(`  - "${s.program.label}" (complexity=${s.program.complexity})`);
    }
  }

  const failedAdv = state.adversarialTests.filter(t => !t.programStillValid);
  if (failedAdv.length > 0) {
    lines.push('');
    lines.push('Known Brittleness:');
    for (const t of failedAdv) {
      lines.push(`  ⚠ ${t.description} — program does NOT generalize`);
    }
  }

  lines.push('');
  lines.push('DIRECTIVE: Explain the locked program. Do NOT propose alternative rules.');
  lines.push('The program has been empirically verified on all training pairs.');
  lines.push('Your role is explanation, not induction. PIE has already done the induction.');
  lines.push('═══════════════════════════════════════════════════════');

  return lines.join('\n');
}
