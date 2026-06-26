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

export const ROWS = 12;
export const COLS = 9;
export const WORD_COUNT = 20;

// Total letters across all words. Higher = denser (fewer random-fill cells).
// Placement relies on overlaps, so this can exceed a naive per-cell budget.
const MAX_TOTAL_LETTERS = 92;
const MIN_TOTAL_LETTERS = 80;

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
 * How many cells are already filled in each row and column. A straight word
 * only fits where its whole length stays on the board, so border cells lie on
 * far fewer candidate lines than central ones. Left to a uniform pick, that
 * geometry leaves the outer rows and columns conspicuously bare. These counts
 * let free (non-crossing) placements steer toward the emptier lines instead.
 */
function lineFill(grid: string[][]): { rowFill: number[]; colFill: number[] } {
  const rowFill = new Array<number>(grid.length).fill(0);
  const colFill = new Array<number>(grid[0].length).fill(0);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== "") {
        rowFill[r]++;
        colFill[c]++;
      }
    }
  }
  return { rowFill, colFill };
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
    // No crossing was forced, so weight the free placement by how empty the
    // rows and columns it would occupy currently are. This counteracts the
    // border sparseness (top/bottom rows and outer columns) without touching
    // the interlocking crossings above, so puzzle difficulty is unchanged.
    const { rowFill, colFill } = lineFill(grid);
    const weights = candidates.map((cand) => {
      let need = 0;
      for (const { r, c } of cand.cells) {
        if (grid[r][c] === "") need += 1 / (1 + rowFill[r]) + 1 / (1 + colFill[c]);
      }
      return need * need; // sharpen so the emptiest lines win clearly
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      chosen = candidates[randInt(candidates.length)];
    } else {
      let pick = Math.random() * total;
      chosen = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        pick -= weights[i];
        if (pick <= 0) {
          chosen = candidates[i];
          break;
        }
      }
    }
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
