import "./style.css";
import { generatePuzzle, type Cell, type Placement, type Puzzle } from "./wordsearch";
import { launchConfetti } from "./confetti";

// --- DOM references -------------------------------------------------------

const gridEl = document.getElementById("grid") as HTMLDivElement;
const wordListEl = document.getElementById("word-list") as HTMLUListElement;
const progressEl = document.getElementById("progress") as HTMLParagraphElement;
const progressFillEl = document.getElementById("progress-fill") as HTMLDivElement;
const winStatsEl = document.getElementById("win-stats") as HTMLParagraphElement;
const newGameBtn = document.getElementById("new-game") as HTMLButtonElement;
const playAgainBtn = document.getElementById("play-again") as HTMLButtonElement;
const winBanner = document.getElementById("win-banner") as HTMLDivElement;
const confettiCanvas = document.getElementById("confetti") as HTMLCanvasElement;

// --- Game state -----------------------------------------------------------

let puzzle: Puzzle;
let cellEls: HTMLDivElement[][] = [];
let linesEl: SVGElement | null = null;
const found = new Set<string>();

// Persistent lines drawn through each found word.
interface Segment {
  a: Cell;
  b: Cell;
  color: string;
  word: string;
}
let foundSegments: Segment[] = [];

// Active drag selection.
let selecting = false;
let startCell: Cell | null = null;
let previewPath: Cell[] = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const PREVIEW_COLOR = "rgba(245, 158, 11, 0.5)";
const MISS_COLOR = "rgba(239, 68, 68, 0.45)";
const segmentHue = (i: number) => (i * 47) % 360;
const segmentColor = (i: number) => `hsla(${segmentHue(i)}, 85%, 55%, 0.5)`;
// Opaque sibling of segmentColor, used for the word-list strike-through.
const wordColor = (i: number) => `hsl(${segmentHue(i)}, 75%, 50%)`;
const STORAGE_KEY = "wordsearch:state:v1";

const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Word pool ------------------------------------------------------------

async function loadWords(): Promise<string[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}words.txt`);
  if (!res.ok) throw new Error(`Failed to load words: ${res.status}`);
  const text = await res.text();
  return text.split("\n").map((w) => w.trim().toUpperCase()).filter(Boolean);
}

// --- Rendering ------------------------------------------------------------

function renderGrid(): void {
  gridEl.style.setProperty("--cols", String(puzzle.cols));
  gridEl.style.setProperty("--rows", String(puzzle.rows));
  gridEl.innerHTML = "";
  cellEls = [];

  for (let r = 0; r < puzzle.rows; r++) {
    const row: HTMLDivElement[] = [];
    for (let c = 0; c < puzzle.cols; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = puzzle.grid[r][c];
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      // Deal the letters in with a diagonal cascade. The class is removed when
      // the animation ends so it can't replay when other classes toggle.
      cell.classList.add("deal");
      cell.style.animationDelay = `${(r + c) * 16}ms`;
      cell.addEventListener(
        "animationend",
        () => {
          cell.classList.remove("deal");
          cell.style.animationDelay = "";
        },
        { once: true },
      );
      gridEl.appendChild(cell);
      row.push(cell);
    }
    cellEls.push(row);
  }

  // Overlay for the selection / found-word lines (drawn on top of the cells).
  linesEl = document.createElementNS(SVG_NS, "svg");
  linesEl.setAttribute("class", "grid-lines");
  gridEl.appendChild(linesEl);
}

function renderWordList(): void {
  wordListEl.innerHTML = "";
  for (const { word } of [...puzzle.placements].sort((a, b) => a.word.localeCompare(b.word))) {
    const li = document.createElement("li");
    li.className = "word";
    li.dataset.word = word;
    li.textContent = word;
    if (found.has(word)) {
      li.classList.add("found");
      // Match the strike-through to the word's line colour in the grid.
      const idx = foundSegments.findIndex((s) => s.word === word);
      if (idx >= 0) li.style.textDecorationColor = wordColor(idx);
    }
    wordListEl.appendChild(li);
  }
}

function renderProgress(): void {
  progressEl.textContent = `${found.size} / ${puzzle.placements.length} found`;
  const pct = (found.size / puzzle.placements.length) * 100;
  progressFillEl.style.width = `${pct}%`;
  progressFillEl.classList.toggle("complete", found.size === puzzle.placements.length);
}

// --- Selection helpers ----------------------------------------------------

function cellFromPoint(x: number, y: number): Cell | null {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof HTMLElement) || !el.classList.contains("cell")) return null;
  return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
}

/** Cells on the straight line from `start` to `end`, or null if not aligned. */
function pathBetween(start: Cell, end: Cell): Cell[] | null {
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  const aligned = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
  if (!aligned) return null;

  const len = Math.max(Math.abs(dr), Math.abs(dc));
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const cells: Cell[] = [];
  for (let i = 0; i <= len; i++) cells.push({ r: start.r + stepR * i, c: start.c + stepC * i });
  return cells;
}

/** Centre of a cell in pixels, relative to the grid's top-left corner. */
function cellCenter(cell: Cell): { x: number; y: number } {
  const grid = gridEl.getBoundingClientRect();
  const rect = cellEls[cell.r][cell.c].getBoundingClientRect();
  return { x: rect.left - grid.left + rect.width / 2, y: rect.top - grid.top + rect.height / 2 };
}

function drawLine(a: Cell, b: Cell, color: string, width: number): SVGLineElement | null {
  if (!linesEl) return null;
  const p1 = cellCenter(a);
  const p2 = cellCenter(b);
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(p1.x));
  line.setAttribute("y1", String(p1.y));
  line.setAttribute("x2", String(p2.x));
  line.setAttribute("y2", String(p2.y));
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", String(width));
  line.setAttribute("stroke-linecap", "round");
  linesEl.appendChild(line);
  return line;
}

/** Sweep a line in from its start point using a dash-offset transition. */
function sweepIn(line: SVGLineElement, a: Cell, b: Cell, width: number): void {
  if (prefersReducedMotion()) return;
  const p1 = cellCenter(a);
  const p2 = cellCenter(b);
  // Full length including the round caps, so nothing is clipped at offset 0.
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) + width;
  line.style.strokeDasharray = String(len);
  line.style.strokeDashoffset = String(len);
  line.style.transition = "stroke-dashoffset 0.35s ease-out";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      line.style.strokeDashoffset = "0";
    });
  });
}

/**
 * Redraw all found-word lines plus the live selection line. With
 * `animateLast`, the most recent found line sweeps in from its first letter.
 */
function drawLines(animateLast = false): void {
  if (!linesEl) return;
  const grid = gridEl.getBoundingClientRect();
  linesEl.setAttribute("viewBox", `0 0 ${grid.width} ${grid.height}`);
  while (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);

  const cell = cellEls[0]?.[0]?.getBoundingClientRect();
  const width = (cell?.width ?? 24) * 0.72;

  foundSegments.forEach((seg, i) => {
    const line = drawLine(seg.a, seg.b, seg.color, width);
    if (line && animateLast && i === foundSegments.length - 1) {
      sweepIn(line, seg.a, seg.b, width);
    }
  });
  if (previewPath.length > 0) {
    drawLine(previewPath[0], previewPath[previewPath.length - 1], PREVIEW_COLOR, width);
  }
}

/** Flash a fading red line over an attempted-but-wrong selection. */
function flashMiss(path: Cell[]): void {
  const cell = cellEls[0]?.[0]?.getBoundingClientRect();
  const width = (cell?.width ?? 24) * 0.72;
  const line = drawLine(path[0], path[path.length - 1], MISS_COLOR, width);
  if (!line) return;
  line.classList.add("miss");
  // Removal is timed rather than tied to animationend so the line still goes
  // away under prefers-reduced-motion (where the fade animation is disabled).
  setTimeout(() => line.remove(), 500);

  // Timed removal: animationend also bubbles up from cell animations, which
  // would end the shake early.
  if (!prefersReducedMotion() && !gridEl.classList.contains("shake")) {
    gridEl.classList.add("shake");
    setTimeout(() => gridEl.classList.remove("shake"), 350);
  }
}

function clearPreview(): void {
  previewPath = [];
  drawLines();
}

function showPreview(path: Cell[]): void {
  previewPath = path;
  drawLines();
}

function samePath(a: Cell[], b: Cell[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((cell, i) => cell.r === b[i].r && cell.c === b[i].c);
}

function matchPlacement(path: Cell[]): Placement | null {
  if (path.length < 2) return null;
  for (const placement of puzzle.placements) {
    if (found.has(placement.word)) continue;
    const reversed = [...placement.cells].reverse();
    if (samePath(path, placement.cells) || samePath(path, reversed)) return placement;
  }
  return null;
}

function markFound(placement: Placement): void {
  found.add(placement.word);
  const index = foundSegments.length;

  // Pop each letter in sequence along the word, following the line sweep.
  const reduced = prefersReducedMotion();
  placement.cells.forEach(({ r, c }, i) => {
    const el = cellEls[r][c];
    el.classList.add("found");
    if (reduced) return;
    el.style.animationDelay = `${i * 45}ms`;
    el.classList.add("pop");
    el.addEventListener(
      "animationend",
      () => {
        el.classList.remove("pop");
        el.style.animationDelay = "";
      },
      { once: true },
    );
  });

  foundSegments.push({
    a: placement.cells[0],
    b: placement.cells[placement.cells.length - 1],
    color: segmentColor(index),
    word: placement.word,
  });
  drawLines(true);
  const li = wordListEl.querySelector<HTMLElement>(`[data-word="${placement.word}"]`);
  if (li) {
    li.classList.add("found");
    li.style.textDecorationColor = wordColor(index);
  }
  renderProgress();
  saveState();

  if (found.size === puzzle.placements.length) {
    setTimeout(showWin, 250);
  }
}

function showWin(): void {
  winStatsEl.textContent = `All ${puzzle.placements.length} words found`;
  winBanner.classList.remove("hidden");
  launchConfetti(confettiCanvas);
}

// --- Pointer interaction --------------------------------------------------

function onPointerDown(e: PointerEvent): void {
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (!cell) return;
  e.preventDefault();
  selecting = true;
  startCell = cell;
  showPreview([cell]);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e: PointerEvent): void {
  if (!selecting || !startCell) return;
  const cell = cellFromPoint(e.clientX, e.clientY);
  if (!cell) return;
  const path = pathBetween(startCell, cell);
  showPreview(path ?? [startCell]);
}

function onPointerUp(): void {
  if (!selecting) return;
  const attempt = previewPath;
  const match = matchPlacement(attempt);
  clearPreview();
  selecting = false;
  startCell = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  if (match) {
    markFound(match);
    return;
  }
  // Flash a real (multi-cell) attempt red — unless it retraces a word that
  // was already found, which isn't a mistake.
  const alreadyFound = puzzle.placements.some(
    (p) =>
      found.has(p.word) &&
      (samePath(attempt, p.cells) || samePath(attempt, [...p.cells].reverse())),
  );
  if (attempt.length >= 2 && !alreadyFound) flashMiss(attempt);
}

// --- Persistence ----------------------------------------------------------

interface SavedState {
  puzzle: Puzzle;
  found: string[];
}

function saveState(): void {
  try {
    const state: SavedState = { puzzle, found: foundSegments.map((s) => s.word) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode, quota) — ignore.
  }
}

function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedState;
    if (!s?.puzzle?.grid?.length || !Array.isArray(s.puzzle.placements) || !Array.isArray(s.found)) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Rebuild the found set and the coloured line segments from a list of words. */
function rebuildFound(words: string[]): void {
  found.clear();
  foundSegments = [];
  for (const word of words) {
    const placement = puzzle.placements.find((p) => p.word === word);
    if (!placement) continue;
    found.add(word);
    foundSegments.push({
      a: placement.cells[0],
      b: placement.cells[placement.cells.length - 1],
      color: segmentColor(foundSegments.length),
      word,
    });
  }
}

// --- Game lifecycle -------------------------------------------------------

/** Render the whole puzzle from current state (grid, list, found marks, lines). */
function render(): void {
  renderGrid();
  renderWordList();
  renderProgress();
  for (const word of found) {
    const placement = puzzle.placements.find((p) => p.word === word);
    placement?.cells.forEach(({ r, c }) => cellEls[r][c].classList.add("found"));
  }
  drawLines();
}

function newGame(pool: string[]): void {
  found.clear();
  foundSegments = [];
  winBanner.classList.add("hidden");
  puzzle = generatePuzzle(pool);
  render();
  saveState();
}

async function main(): Promise<void> {
  let pool: string[];
  try {
    pool = await loadWords();
  } catch (err) {
    progressEl.textContent = "Could not load the word list.";
    console.error(err);
    return;
  }

  gridEl.addEventListener("pointerdown", onPointerDown);
  newGameBtn.addEventListener("click", () => newGame(pool));
  playAgainBtn.addEventListener("click", () => newGame(pool));

  // Keep the lines aligned with the grid as it reflows / resizes.
  new ResizeObserver(() => drawLines()).observe(gridEl);

  // Restore the previous session if there is one, otherwise start fresh.
  const saved = loadState();
  if (saved) {
    puzzle = saved.puzzle;
    rebuildFound(saved.found);
    render();
  } else {
    newGame(pool);
  }
}

main();

// Register the service worker for offline play (production builds only).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
