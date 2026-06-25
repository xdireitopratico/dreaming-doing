export type WireframeSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type WireframeLabel = {
  text: string;
  row: number;
  col: number;
};

export type WireframeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WireframeDiagramModel = {
  width: number;
  height: number;
  viewBox: string;
  segments: WireframeSegment[];
  labels: WireframeLabel[];
  rects: WireframeRect[];
  hasVisualFrame: boolean;
};

const CELL_WIDTH = 12;
const CELL_HEIGHT = 20;
const PADDING_X = 18;
const PADDING_Y = 18;

type Direction = "N" | "S" | "E" | "W";

const DIRS_BY_CHAR: Record<string, Direction[]> = {
  "-": ["E", "W"],
  "|": ["N", "S"],
  "+": ["N", "S", "E", "W"],
  "─": ["E", "W"],
  "│": ["N", "S"],
  "┌": ["E", "S"],
  "┐": ["W", "S"],
  "└": ["N", "E"],
  "┘": ["N", "W"],
  "├": ["N", "S", "E"],
  "┤": ["N", "S", "W"],
  "┬": ["E", "W", "S"],
  "┴": ["E", "W", "N"],
  "┼": ["N", "S", "E", "W"],
};

const OPPOSITE_DIR: Record<Direction, Direction> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
};

function normalizeLines(text: string): string[] {
  const rawLines = text.trimEnd().replace(/\t/g, "  ").split("\n");
  const width = rawLines.reduce((max, line) => Math.max(max, line.length), 0);
  return rawLines.map((line) => line.padEnd(width, " "));
}

function dirsForChar(char: string): Direction[] {
  return DIRS_BY_CHAR[char] ?? [];
}

function isLineChar(char: string): boolean {
  return dirsForChar(char).length > 0;
}

function hasConnection(lines: string[], row: number, col: number, dir: Direction): boolean {
  const char = lines[row]?.[col] ?? " ";
  const dirs = dirsForChar(char);
  if (!dirs.includes(dir)) return false;

  const nextRow = dir === "N" ? row - 1 : dir === "S" ? row + 1 : row;
  const nextCol = dir === "W" ? col - 1 : dir === "E" ? col + 1 : col;
  const neighbor = lines[nextRow]?.[nextCol] ?? " ";
  return dirsForChar(neighbor).includes(OPPOSITE_DIR[dir]);
}

function centerX(col: number): number {
  return PADDING_X + col * CELL_WIDTH + CELL_WIDTH / 2;
}

function centerY(row: number): number {
  return PADDING_Y + row * CELL_HEIGHT + CELL_HEIGHT / 2;
}

function horizontalPath(lines: string[], row: number, startCol: number, endCol: number): boolean {
  for (let col = startCol + 1; col < endCol; col++) {
    const char = lines[row]?.[col] ?? " ";
    const dirs = dirsForChar(char);
    if (!(dirs.includes("E") || dirs.includes("W"))) return false;
  }
  return true;
}

function verticalPath(lines: string[], col: number, startRow: number, endRow: number): boolean {
  for (let row = startRow + 1; row < endRow; row++) {
    const char = lines[row]?.[col] ?? " ";
    const dirs = dirsForChar(char);
    if (!(dirs.includes("N") || dirs.includes("S"))) return false;
  }
  return true;
}

function buildSegments(lines: string[]): WireframeSegment[] {
  const segments = new Map<string, WireframeSegment>();

  for (let row = 0; row < lines.length; row++) {
    for (let col = 0; col < lines[row]!.length; col++) {
      const char = lines[row]![col]!;
      if (!isLineChar(char)) continue;

      for (const dir of dirsForChar(char)) {
        if (!hasConnection(lines, row, col, dir)) continue;
        const nextRow = dir === "N" ? row - 1 : dir === "S" ? row + 1 : row;
        const nextCol = dir === "W" ? col - 1 : dir === "E" ? col + 1 : col;
        const x1 = centerX(col);
        const y1 = centerY(row);
        const x2 = centerX(nextCol);
        const y2 = centerY(nextRow);
        const key = x1 < x2 || y1 < y2 ? `${x1}:${y1}:${x2}:${y2}` : `${x2}:${y2}:${x1}:${y1}`;
        segments.set(key, { x1, y1, x2, y2 });
      }
    }
  }

  return [...segments.values()];
}

function buildLabels(lines: string[]): WireframeLabel[] {
  const labels: WireframeLabel[] = [];

  for (let row = 0; row < lines.length; row++) {
    let buffer = "";
    let startCol = 0;

    const flush = () => {
      const text = buffer.trim();
      if (text) labels.push({ text, row, col: startCol });
      buffer = "";
    };

    for (let col = 0; col < lines[row]!.length; col++) {
      const char = lines[row]![col]!;
      if (char !== " " && !isLineChar(char)) {
        if (!buffer) startCol = col;
        buffer += char;
      } else {
        flush();
      }
    }

    flush();
  }

  return labels;
}

function isTopLeft(lines: string[], row: number, col: number): boolean {
  return hasConnection(lines, row, col, "E") && hasConnection(lines, row, col, "S");
}

function isTopRight(lines: string[], row: number, col: number): boolean {
  return hasConnection(lines, row, col, "W") && hasConnection(lines, row, col, "S");
}

function isBottomLeft(lines: string[], row: number, col: number): boolean {
  return hasConnection(lines, row, col, "N") && hasConnection(lines, row, col, "E");
}

function isBottomRight(lines: string[], row: number, col: number): boolean {
  return hasConnection(lines, row, col, "N") && hasConnection(lines, row, col, "W");
}

function buildRects(lines: string[]): WireframeRect[] {
  const rects = new Map<string, WireframeRect>();

  for (let row = 0; row < lines.length; row++) {
    for (let col = 0; col < lines[row]!.length; col++) {
      if (!isTopLeft(lines, row, col)) continue;

      for (let rightCol = col + 2; rightCol < lines[row]!.length; rightCol++) {
        if (!isTopRight(lines, row, rightCol)) continue;
        if (!horizontalPath(lines, row, col, rightCol)) continue;

        for (let bottomRow = row + 2; bottomRow < lines.length; bottomRow++) {
          if (!isBottomLeft(lines, bottomRow, col)) continue;
          if (!isBottomRight(lines, bottomRow, rightCol)) continue;
          if (!verticalPath(lines, col, row, bottomRow)) continue;
          if (!verticalPath(lines, rightCol, row, bottomRow)) continue;
          if (!horizontalPath(lines, bottomRow, col, rightCol)) continue;

          const key = `${row}:${col}:${bottomRow}:${rightCol}`;
          rects.set(key, {
            x: centerX(col) - CELL_WIDTH / 2,
            y: centerY(row) - CELL_HEIGHT / 2,
            width: (rightCol - col) * CELL_WIDTH,
            height: (bottomRow - row) * CELL_HEIGHT,
          });
          break;
        }
      }
    }
  }

  return [...rects.values()].sort((a, b) => b.width * b.height - a.width * a.height);
}

export function buildWireframeDiagramModel(text: string): WireframeDiagramModel {
  const lines = normalizeLines(text);
  const cols = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const rows = lines.length;
  const width = Math.max(320, cols * CELL_WIDTH + PADDING_X * 2);
  const height = Math.max(120, rows * CELL_HEIGHT + PADDING_Y * 2);
  const segments = buildSegments(lines);
  const labels = buildLabels(lines);
  const rects = buildRects(lines);

  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    segments,
    labels,
    rects,
    hasVisualFrame: segments.length > 0 || rects.length > 0,
  };
}
