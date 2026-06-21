import "./style.css";
import { generatePuzzle, type Cell, type Placement, type Puzzle } from "./wordsearch";
import { launchConfetti } from "./confetti";

// --- DOM references -------------------------------------------------------

const gridEl = document.getElementById("grid") as HTMLDivElement;
const wordListEl = document.getElementById("word-list") as HTMLUListElement;
const progressEl = document.getElementById("progress") as HTMLParagraphElement;
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
}
let foundSegments: Segment[] = [];

// Active drag selection.
let selecting = false;
let startCell: Cell | null = null;
let previewPath: Cell[] = [];

const SVG_NS = "http://www.w3.org/2000/svg";
const PREVIEW_COLOR = "rgba(245, 158, 11, 0.5)";
const segmentColor = (i: number) => `hsla(${(i * 47) % 360}, 85%, 55%, 0.5)`;

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
    if (found.has(word)) li.classList.add("found");
    wordListEl.appendChild(li);
  }
}

function renderProgress(): void {
  progressEl.textContent = `${found.size} / ${puzzle.placements.length} found`;
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

function drawLine(a: Cell, b: Cell, color: string, width: number): void {
  if (!linesEl) return;
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
}

/** Redraw all found-word lines plus the live selection line. */
function drawLines(): void {
  if (!linesEl) return;
  const grid = gridEl.getBoundingClientRect();
  linesEl.setAttribute("viewBox", `0 0 ${grid.width} ${grid.height}`);
  while (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);

  const cell = cellEls[0]?.[0]?.getBoundingClientRect();
  const width = (cell?.width ?? 24) * 0.72;

  for (const seg of foundSegments) drawLine(seg.a, seg.b, seg.color, width);
  if (previewPath.length > 0) {
    drawLine(previewPath[0], previewPath[previewPath.length - 1], PREVIEW_COLOR, width);
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
  for (const { r, c } of placement.cells) cellEls[r][c].classList.add("found");
  foundSegments.push({
    a: placement.cells[0],
    b: placement.cells[placement.cells.length - 1],
    color: segmentColor(foundSegments.length),
  });
  drawLines();
  wordListEl.querySelector(`[data-word="${placement.word}"]`)?.classList.add("found");
  renderProgress();

  if (found.size === puzzle.placements.length) {
    setTimeout(showWin, 250);
  }
}

function showWin(): void {
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
  const match = matchPlacement(previewPath);
  clearPreview();
  selecting = false;
  startCell = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  if (match) markFound(match);
}

// --- Game lifecycle -------------------------------------------------------

function newGame(pool: string[]): void {
  found.clear();
  foundSegments = [];
  winBanner.classList.add("hidden");
  puzzle = generatePuzzle(pool);
  renderGrid();
  renderWordList();
  renderProgress();
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

  newGame(pool);
}

main();
