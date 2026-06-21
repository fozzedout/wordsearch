// Word search puzzle generation.
//
// Builds a ROWS x COLS grid containing `WORD_COUNT` words placed horizontally,
// vertically or diagonally (forwards or backwards). Empty cells are filled with
// random letters. Words may cross where their letters match.

export interface Cell {
  r: number;
  c: number;
}

export interface Placement {
  word: string;
  cells: Cell[];
}

export interface Puzzle {
  rows: number;
  cols: number;
  grid: string[][];
  placements: Placement[];
}

export const ROWS = 9;
export const COLS = 6;
export const WORD_COUNT = 10;

// Keep total letters comfortably below the 54 cells so placement (with some
// overlaps) reliably succeeds.
const MAX_TOTAL_LETTERS = 40;
const MIN_TOTAL_LETTERS = 30;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The 8 placement directions: horizontal, vertical and both diagonals, each
// in both orientations.
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

/**
 * Pick `count` distinct words from the pool whose combined length fits the grid.
 * The longest word can be at most `maxLen` (so it fits in every orientation).
 */
function pickWords(pool: string[], count: number, maxLen: number): string[] | null {
  for (let attempt = 0; attempt < 400; attempt++) {
    const chosen: string[] = [];
    const seen = new Set<string>();
    let total = 0;
    let guard = 0;

    while (chosen.length < count && guard < 5000) {
      guard++;
      const w = pool[randInt(pool.length)];
      if (w.length > maxLen || seen.has(w)) continue;
      // Leave room for the remaining words (assume at least length 3 each).
      const remaining = count - chosen.length - 1;
      if (total + w.length + remaining * 3 > MAX_TOTAL_LETTERS) continue;
      chosen.push(w);
      seen.add(w);
      total += w.length;
    }

    if (chosen.length === count && total >= MIN_TOTAL_LETTERS) return chosen;
  }
  return null;
}

function emptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array<string>(cols).fill(""));
}

// Chance of forcing a crossing placement when one is available. High values
// interlock the words, which makes the puzzle noticeably harder.
const OVERLAP_BIAS = 0.85;

interface Candidate {
  cells: Cell[];
  overlap: number;
}

/**
 * Try to place a single word, preferring positions that cross words already on
 * the board so the puzzle interlocks instead of laying words out in isolation.
 */
function placeWord(grid: string[][], word: string): Cell[] | null {
  const rows = grid.length;
  const cols = grid[0].length;
  const candidates: Candidate[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of DIRECTIONS) {
        const endR = r + dr * (word.length - 1);
        const endC = c + dc * (word.length - 1);
        if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;

        const cells: Cell[] = [];
        let overlap = 0;
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const cr = r + dr * i;
          const cc = c + dc * i;
          const existing = grid[cr][cc];
          if (existing !== "") {
            if (existing !== word[i]) {
              ok = false;
              break;
            }
            overlap++;
          }
          cells.push({ r: cr, c: cc });
        }
        if (ok) candidates.push({ cells, overlap });
      }
    }
  }

  if (candidates.length === 0) return null;

  const crossing = candidates.filter((cand) => cand.overlap > 0);
  let chosen: Candidate;
  if (crossing.length > 0 && Math.random() < OVERLAP_BIAS) {
    // Weight by overlap² so multi-letter crossings are strongly preferred.
    const total = crossing.reduce((sum, cand) => sum + cand.overlap * cand.overlap, 0);
    let pick = Math.random() * total;
    chosen = crossing[crossing.length - 1];
    for (const cand of crossing) {
      pick -= cand.overlap * cand.overlap;
      if (pick <= 0) {
        chosen = cand;
        break;
      }
    }
  } else {
    chosen = candidates[randInt(candidates.length)];
  }

  for (let i = 0; i < chosen.cells.length; i++) {
    grid[chosen.cells[i].r][chosen.cells[i].c] = word[i];
  }
  return chosen.cells;
}

function emptyCells(grid: string[][]): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++) if (grid[r][c] === "") cells.push({ r, c });
  return cells;
}

function fillCells(grid: string[][], cells: Cell[]): void {
  for (const { r, c } of cells) grid[r][c] = ALPHABET[randInt(ALPHABET.length)];
}

// Canonical axes (one per line orientation) so each straight segment is counted
// once regardless of which way it is read.
const AXES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** How many distinct straight segments spell `word` (forwards or backwards). */
function countSegments(grid: string[][], word: string): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const reversed = [...word].reverse().join("");
  const len = word.length;
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of AXES) {
        const endR = r + dr * (len - 1);
        const endC = c + dc * (len - 1);
        if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;
        let s = "";
        for (let i = 0; i < len; i++) s += grid[r + dr * i][c + dc * i];
        if (s === word || s === reversed) count++;
      }
    }
  }
  return count;
}

/**
 * True when every word can be found in exactly one place — so the player never
 * sees a second, valid-looking position that the game would reject.
 */
function isUnambiguous(grid: string[][], words: string[]): boolean {
  return words.every((w) => countSegments(grid, w) === 1);
}

/** Generate a complete puzzle, retrying word selection/placement until it fits. */
export function generatePuzzle(pool: string[]): Puzzle {
  const maxLen = Math.min(ROWS, COLS); // longest word fits in any orientation

  for (let attempt = 0; attempt < 80; attempt++) {
    const words = pickWords(pool, WORD_COUNT, maxLen);
    if (!words) continue;

    // Place longest words first — they are the hardest to fit.
    words.sort((a, b) => b.length - a.length);

    const grid = emptyGrid(ROWS, COLS);
    const placements: Placement[] = [];
    let success = true;

    for (const word of words) {
      const cells = placeWord(grid, word);
      if (!cells) {
        success = false;
        break;
      }
      placements.push({ word, cells });
    }

    if (!success) continue;

    // Fill the blanks, retrying until no word appears a second time. If random
    // fills can't make it unambiguous (e.g. the placed words themselves spell a
    // duplicate), fall through and try a fresh placement.
    const blanks = emptyCells(grid);
    for (let fillTry = 0; fillTry < 40; fillTry++) {
      fillCells(grid, blanks);
      if (isUnambiguous(grid, words)) {
        return { rows: ROWS, cols: COLS, grid, placements };
      }
    }
  }

  throw new Error("Failed to generate a puzzle. Try again.");
}
