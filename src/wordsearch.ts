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

export const ROWS = 6;
export const COLS = 9;
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

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

/** Try to place a single word into the grid, returning its cells or null. */
function placeWord(grid: string[][], word: string): Cell[] | null {
  const rows = grid.length;
  const cols = grid[0].length;

  const starts: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) starts.push({ r, c });
  shuffle(starts);
  const dirs = shuffle([...DIRECTIONS]);

  for (const start of starts) {
    for (const [dr, dc] of dirs) {
      const endR = start.r + dr * (word.length - 1);
      const endC = start.c + dc * (word.length - 1);
      if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;

      const cells: Cell[] = [];
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = start.r + dr * i;
        const c = start.c + dc * i;
        const existing = grid[r][c];
        if (existing !== "" && existing !== word[i]) {
          ok = false;
          break;
        }
        cells.push({ r, c });
      }
      if (!ok) continue;

      for (let i = 0; i < word.length; i++) grid[cells[i].r][cells[i].c] = word[i];
      return cells;
    }
  }
  return null;
}

function fillEmpty(grid: string[][]): void {
  for (const row of grid) {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "") row[c] = ALPHABET[randInt(ALPHABET.length)];
    }
  }
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

    if (success) {
      fillEmpty(grid);
      return { rows: ROWS, cols: COLS, grid, placements };
    }
  }

  throw new Error("Failed to generate a puzzle. Try again.");
}
