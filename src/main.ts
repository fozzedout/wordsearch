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
const found = new Set<string>();

// Active drag selection.
let selecting = false;
let startCell: Cell | null = null;
let previewPath: Cell[] = [];

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

function clearPreview(): void {
  for (const { r, c } of previewPath) cellEls[r][c]?.classList.remove("selecting");
  previewPath = [];
}

function showPreview(path: Cell[]): void {
  clearPreview();
  previewPath = path;
  for (const { r, c } of path) cellEls[r][c]?.classList.add("selecting");
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

  newGame(pool);
}

main();
