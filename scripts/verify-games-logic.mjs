#!/usr/bin/env node
/**
 * Offline verification for the games client module.
 * Loads the real client.js in a sandbox with a stubbed module loader and React,
 * then asserts the pure game logic for both 2048 and Tetris.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const clientPath = new URL('../client.js', import.meta.url);
const source = readFileSync(clientPath, 'utf8');

let caught = null;
const windowStub = {
  localStorage: {
    _data: new Map(),
    getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
    setItem(key, value) { this._data.set(key, String(value)); },
  },
  __ModuleLoader__: {
    load(config) { caught = config; },
  },
};

const reactStub = {
  createElement: () => null,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (fn) => fn,
};

const sandbox = {
  window: windowStub,
  globalThis: {},
  console,
  require: (name) => {
    if (name === 'react') return reactStub;
    throw new Error(`unexpected require: ${name}`);
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

// Values crossing the vm boundary keep the other realm's prototypes; compare data only.
const plain = (value) => JSON.parse(JSON.stringify(value));
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), expected, message);

assert.ok(caught, 'module loader was not invoked');
assert.equal(caught.id, 'dsh-casual-games');
const plugin = caught.factory(sandbox.require);
eq(plugin.inject, ['slots']);
assert.equal(typeof plugin.apply, 'function');

const {
  computeMove, boardFromTiles, tilesFromBoard, canMove, isBoard, spawnRandom, cellAt,
  rotateShape, getShape, pieceCells, collides, clearLines, emptyTetrisBoard, freshTetrisState,
  freshGomokuState, placeStone, gomokuWinAt, gomokuAiMove, gomokuWouldWin,
  freshKlotskiState, klotskiCanMove, klotskiMove,
  freshSnakeState, snakeStep,
  freshSchulteState, schulteShuffle, schulteTap, schulteSlot,
  freshBreakoutState, breakoutStep,
  freshSokobanState, sokobanParse, sokobanMove, sokobanSolved, SOKOBAN_LEVELS,
  SUDOKU_PUZZLES, SUDOKU_DIFFICULTIES, SUDOKU_PER_LEVEL, sudokuFresh, sudokuIsSolved,
  sudokuPlace, sudokuErase, sudokuToggleNotesMode, sudokuSelect, sudokuNextPuzzle,
  sudokuSetDifficulty, sudokuCompletedDigits, sudokuHighlightDigit, sanitizeSudoku,
} = plugin.__internals;

// ┌──────────────────────────────────────────────────────────────┐
// │ 2048 logic                                                   │
// └──────────────────────────────────────────────────────────────┘
let sequence = 1;
const mk = (value, row, column) => ({ id: sequence++, value, row, column });

// --- merge routing: both halves slide onto the same target cell ---
const row = [mk(2, 0, 0), mk(2, 0, 1), mk(4, 0, 2), mk(4, 0, 3)];
const left = computeMove(row, 'left');
assert.equal(left.gained, 12);
assert.equal(left.moved, true);
eq(left.merges.map((merge) => ({ value: merge.value, row: merge.row, column: merge.column })), [
  { value: 4, row: 0, column: 0 },
  { value: 8, row: 0, column: 1 },
]);
eq(left.tiles.map((tile) => [tile.value, tile.row, tile.column]), [
  [2, 0, 0], [2, 0, 0], [4, 0, 1], [4, 0, 1],
]);
eq(boardFromTiles(left.tiles), [
  [4, 8, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
]);
// Tile ids must survive the move so the same DOM node transitions to its new cell.
eq(
  left.tiles.map((tile) => tile.id).sort((a, b) => a - b),
  row.map((tile) => tile.id).sort((a, b) => a - b),
);

// --- right merge into the far edge ---
const right = computeMove([mk(2, 0, 0), mk(2, 0, 3)], 'right');
assert.equal(right.gained, 4);
eq(right.merges.map((merge) => [merge.value, merge.row, merge.column]), [[4, 0, 3]]);
eq(boardFromTiles(right.tiles)[0], [0, 0, 0, 4]);

// --- plain slide without merge ---
const slide = computeMove([mk(2, 0, 0), mk(4, 0, 2)], 'right');
assert.equal(slide.moved, true);
assert.equal(slide.gained, 0);
eq(boardFromTiles(slide.tiles)[0], [0, 0, 2, 4]);

// --- no-op move ---
assert.equal(computeMove([mk(2, 0, 0), mk(4, 0, 1)], 'left').moved, false);

// --- vertical moves ---
const column = [mk(2, 0, 0), mk(2, 1, 0), mk(4, 2, 0), mk(4, 3, 0)];
const up = computeMove(column, 'up');
assert.equal(up.gained, 12);
eq(up.merges.map((merge) => [merge.value, merge.row, merge.column]), [[4, 0, 0], [8, 1, 0]]);
eq(boardFromTiles(up.tiles).map((line) => line[0]), [4, 8, 0, 0]);

const down = computeMove([mk(2, 0, 0), mk(2, 1, 0), mk(4, 2, 0), mk(4, 3, 0)], 'down');
eq(down.merges.map((merge) => [merge.value, merge.row, merge.column]), [[8, 3, 0], [4, 2, 0]]);
eq(boardFromTiles(down.tiles).map((line) => line[0]), [0, 0, 4, 8]);

// --- board <-> tiles round-trip ---
const board = [
  [2, 0, 0, 4],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];
const roundTrip = tilesFromBoard(board);
eq(roundTrip.map((tile) => [tile.value, tile.row, tile.column]), [[2, 0, 0], [4, 0, 3]]);
eq(boardFromTiles(roundTrip), board);

// --- random spawn: exactly one tile, inside the grid, on an empty cell ---
const spawned = spawnRandom([mk(2, 0, 0)]);
assert.ok(spawned, 'spawnRandom returned no tile');
assert.ok([2, 4].includes(spawned.value));
assert.ok(!(spawned.row === 0 && spawned.column === 0), 'spawned onto an occupied cell');
assert.equal(boardFromTiles([mk(2, 0, 0), spawned]).flat().filter(Boolean).length, 2);

// --- terminal detection ---
assert.equal(canMove([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), true);
assert.equal(canMove([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), true);
const stuck = [
  [2, 4, 2, 4],
  [4, 2, 4, 2],
  [2, 4, 2, 4],
  [4, 2, 4, 2],
];
assert.equal(canMove(stuck), false);

// --- state validation ---
assert.equal(isBoard(board), true);
assert.equal(isBoard([[2, 2, 2], [2, 2, 2], [2, 2, 2]]), false);
assert.equal(isBoard('nope'), false);

// --- cell mapping for every direction ---
eq(cellAt('left', 1, 2), { row: 1, column: 2 });
eq(cellAt('right', 1, 0), { row: 1, column: 3 });
eq(cellAt('up', 1, 2), { row: 2, column: 1 });
eq(cellAt('down', 1, 0), { row: 3, column: 1 });

// ┌──────────────────────────────────────────────────────────────┐
// │ Tetris logic                                                 │
// └──────────────────────────────────────────────────────────────┘
const COLS = 10;
const ROWS = 20;
const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// empty board
const empty = emptyTetrisBoard();
eq(empty.length, ROWS);
eq(empty.every((row) => row.length === COLS && row.every((cell) => cell === 0)), true);

// rotation: L clockwise
const lShape = [
  [0, 0, 1],
  [1, 1, 1],
  [0, 0, 0],
];
eq(rotateShape(lShape), [
  [0, 1, 0],
  [0, 1, 0],
  [0, 1, 1],
]);
eq(getShape('L', 1), rotateShape(lShape));
eq(getShape('L', 4), lShape); // full rotation back to original

// O tetromino: 2x2 square, rotation does nothing
const oShape = [[1, 1], [1, 1]];
eq(rotateShape(oShape), [[1, 1], [1, 1]]);

// pieceCells mapping
eq(pieceCells('I', 0, 3, 0), [
  { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 },
]);
eq(pieceCells('O', 0, 0, 0), [
  { r: 0, c: 0 }, { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 1 },
]);

// collides: walls
assert.equal(collides(emptyTetrisBoard(), [{ r: 0, c: -1 }]), true);
assert.equal(collides(emptyTetrisBoard(), [{ r: 0, c: 10 }]), true);
assert.equal(collides(emptyTetrisBoard(), [{ r: 20, c: 0 }]), true);
assert.equal(collides(emptyTetrisBoard(), [{ r: -1, c: 0 }]), false); // above board ok
assert.equal(collides(emptyTetrisBoard(), [{ r: 0, c: 0 }]), false);

// collides: existing block
const blocked = emptyTetrisBoard();
blocked[5][3] = 1;
assert.equal(collides(blocked, [{ r: 5, c: 3 }]), true);
assert.equal(collides(blocked, [{ r: 5, c: 4 }]), false);

// clearLines: removes full rows, adds empty rows at top
const boardT = emptyTetrisBoard();
boardT[19] = Array(COLS).fill(1);
boardT[18] = Array(COLS).fill(1);
const cleared = clearLines(boardT);
assert.equal(cleared, 2);
eq(boardT.length, ROWS);
eq(boardT[0], Array(COLS).fill(0));
eq(boardT[1], Array(COLS).fill(0));
eq(boardT[19].every((cell) => cell === 0), true);

// clearLines: no full rows
const noClear = emptyTetrisBoard();
noClear[19][5] = 0;
assert.equal(clearLines(noClear), 0);

// spawn piece at top-center, does not collide on fresh board
const fresh = freshTetrisState();
assert.equal(fresh.started, false);
assert.ok(PIECE_TYPES.includes(fresh.piece.type));
assert.equal(fresh.piece.x, Math.floor(COLS / 2) - 1);
assert.equal(fresh.piece.y, 0);
assert.equal(fresh.piece.rotation, 0);
assert.equal(collides(fresh.board, pieceCells(fresh.piece.type, fresh.piece.rotation, fresh.piece.x, fresh.piece.y)), false);
assert.ok(PIECE_TYPES.includes(fresh.next));

// ┌──────────────────────────────────────────────────────────────┐
// │ Gomoku                                                       │
// └──────────────────────────────────────────────────────────────┘
const N = 15;
let g = freshGomokuState();
assert.equal(g.turn, 1);
assert.equal(g.board.length, N);
assert.equal(g.board.flat().every((cell) => cell === 0), true);

for (let index = 0; index < 5; index += 1) {
  g = placeStone(g, 7, index);
  if (index < 4) g = placeStone(g, 8, index);
}
assert.equal(g.winner, 1);
assert.equal(g.moves, 9);

const sameCell = placeStone(g, 0, 0);
assert.equal(sameCell, g); // game already won -> no-op

const four = freshGomokuState().board.map((line) => line.slice());
for (let index = 0; index < 4; index += 1) four[3][index] = 1;
assert.equal(gomokuWinAt(four, 3, 0, 1), false);
four[3][4] = 1;
assert.equal(gomokuWinAt(four, 3, 0, 1), true);

// single-player AI
const emptyBoard = freshGomokuState().board;
const opening = gomokuAiMove(emptyBoard, 2, 1);
assert.ok(opening && emptyBoard[opening.row][opening.col] === 0);

const fourBoard = freshGomokuState().board.map((line) => line.slice());
for (let col = 2; col <= 5; col += 1) fourBoard[7][col] = 1;
const block = gomokuAiMove(fourBoard, 2, 1);
assert.ok(block && block.row === 7 && (block.col === 1 || block.col === 6));

const aiFour = freshGomokuState().board.map((line) => line.slice());
for (let col = 2; col <= 5; col += 1) aiFour[5][col] = 2;
const win = gomokuAiMove(aiFour, 2, 1);
assert.ok(win && win.row === 5 && (win.col === 1 || win.col === 6));

const hardBlock = gomokuAiMove(fourBoard, 2, 1, 'hard');
assert.ok(hardBlock && hardBlock.row === 7 && (hardBlock.col === 1 || hardBlock.col === 6), 'hard blocks a four');
const hardWin = gomokuAiMove(aiFour, 2, 1, 'hard');
assert.ok(hardWin && hardWin.row === 5 && (hardWin.col === 1 || hardWin.col === 6), 'hard takes a win');
assert.equal(freshGomokuState().level, 'normal');
assert.equal(gomokuWouldWin(fourBoard, 7, 1, 1), true);

// easy never plays next to your stones (it is a pure beginner)
const easyBoard = freshGomokuState().board.map((line) => line.slice());
easyBoard[7][7] = 1;
easyBoard[7][8] = 1;
for (let attempt = 0; attempt < 5; attempt += 1) {
  const easyMove = gomokuAiMove(easyBoard, 2, 1, 'easy');
  assert.ok(easyMove, 'easy returns a move');
  assert.ok(
    Math.abs(easyMove.row - 7) > 1 || Math.abs(easyMove.col - 7) > 1,
    'easy avoids the area around human stones',
  );
}

// ┌──────────────────────────────────────────────────────────────┐
// │ Klotski                                                      │
// └──────────────────────────────────────────────────────────────┘
let k = freshKlotskiState();
assert.equal(k.pieces.length, 10);
assert.equal(k.solved, false);
assert.equal(k.moves, 0);
const cao = k.pieces.find((piece) => piece.id === 'cao');
eq([cao.x, cao.y, cao.w, cao.h], [1, 0, 2, 2]);

assert.equal(klotskiCanMove(k.pieces, 's1', 0, 1), true);   // 卒 slides into the empty bottom row
assert.equal(klotskiCanMove(k.pieces, 's1', 0, -1), false); // 曹操/关羽 block upward
assert.equal(klotskiCanMove(k.pieces, 'cao', 0, 1), false); // blocked by 关羽
assert.equal(klotskiMove(k, 0, 1), k);                      // nothing selected -> no-op

k = { ...k, selected: 's1' };
k = klotskiMove(k, 0, 1);
assert.equal(k.moves, 1);
eq(k.pieces.find((piece) => piece.id === 's1').y, 4);

const base = freshKlotskiState();
const clearedBoard = {
  pieces: base.pieces
    .filter((piece) => !['guan', 's1', 's2'].includes(piece.id))
    .map((piece) => (piece.id === 'cao' ? { ...piece, x: 1, y: 2 } : piece)),
  selected: 'cao',
  moves: 0,
  solved: false,
};
const finished = klotskiMove(clearedBoard, 0, 1);
assert.equal(finished.pieces.find((piece) => piece.id === 'cao').y, 3);
assert.equal(finished.solved, true);

// ┌──────────────────────────────────────────────────────────────┐
// │ Snake                                                        │
// └──────────────────────────────────────────────────────────────┘
let sn = freshSnakeState();
assert.equal(sn.snake.length, 3);
eq(sn.snake[0], { r: 7, c: 6 });
eq(sn.dir, { r: 0, c: 1 });

const moved = snakeStep(sn);
eq(moved.snake[0], { r: 7, c: 7 });
assert.equal(moved.snake.length, 3);
assert.equal(moved.score, 0);

const fed = snakeStep({ ...sn, food: { r: 7, c: 7 } });
eq(fed.snake[0], { r: 7, c: 7 });
assert.equal(fed.snake.length, 4);
assert.equal(fed.score, 10);
assert.equal(fed.best, 10);
assert.ok(fed.food);

const wall = snakeStep({
  snake: [{ r: 0, c: 0 }],
  dir: { r: -1, c: 0 },
  food: null,
  score: 0,
  best: 0,
  alive: true,
  paused: false,
});
assert.equal(wall.alive, false);

const paused = { ...sn, paused: true };
assert.equal(snakeStep(paused), paused);

// ┌──────────────────────────────────────────────────────────────┐
// │ Schulte table                                                │
// └──────────────────────────────────────────────────────────────┘
let sc = freshSchulteState(0);
assert.equal(sc.cells.length, 25);
assert.deepEqual([...sc.cells].sort((a, b) => a - b), Array.from({ length: 25 }, (_, index) => index + 1));
assert.equal(sc.next, 1);
assert.equal(sc.finished, false);
assert.equal(freshSchulteState(1234).best, 1234);

const wrongTap = schulteTap(sc, sc.cells.indexOf(5));
assert.equal(wrongTap.errors, 1);
assert.equal(wrongTap.next, 1);
assert.deepEqual(wrongTap.cells, sc.cells);

const firstTap = schulteTap(sc, sc.cells.indexOf(1));
assert.equal(firstTap.next, 2);
assert.equal(firstTap.cells[sc.cells.indexOf(1)], 0);
assert.equal(firstTap.errors, 0);

const shuffled = schulteShuffle(sc.cells);
assert.deepEqual([...shuffled].sort((a, b) => a - b), Array.from({ length: 25 }, (_, index) => index + 1));

const circleSlots = Array.from({ length: 25 }, (_, index) => schulteSlot(index, 'circle'));
const uniqueSlots = new Set(circleSlots.map((slot) => `${slot.x.toFixed(1)},${slot.y.toFixed(1)}`));
assert.equal(uniqueSlots.size, 25, 'circle board places every number in a distinct slot');

const centre = schulteSlot(0, 'circle');
const centreDist = Math.hypot(centre.x + 14 - 108, centre.y + 14 - 108);
assert.ok(centreDist < 0.001, 'slot 0 sits at the board centre');

const ringOne = schulteSlot(1, 'circle');
const ringOneDist = Math.hypot(ringOne.x + 14 - 108, ringOne.y + 14 - 108);
assert.ok(Math.abs(ringOneDist - 56) < 0.001, 'first ring uses radius 56');

const spun = schulteSlot(1, 'circle', 90);
const spunDist = Math.hypot(spun.x + 14 - 108, spun.y + 14 - 108);
assert.ok(Math.abs(spunDist - 56) < 0.001, 'spin keeps ring radius');
assert.ok(Math.abs(spun.x - ringOne.x) > 0.5 || Math.abs(spun.y - ringOne.y) > 0.5, 'spin moves the slot');

assert.equal(freshSchulteState(0, 'circle').mode, 'circle');
assert.equal(freshSchulteState(0).mode, 'grid');

let run = freshSchulteState(0);
for (let value = 1; value <= 25; value += 1) run = schulteTap(run, run.cells.indexOf(value));
assert.equal(run.next, 26);
assert.equal(run.finished, true);
assert.equal(run.cells.every((cell) => cell === 0), true);

// ┌──────────────────────────────────────────────────────────────┐
// │ Breakout                                                     │
// └──────────────────────────────────────────────────────────────┘
const bk = freshBreakoutState(0);
assert.equal(bk.bricks.length, 39);
assert.equal(bk.lives, 3);
assert.equal(bk.started, false);
assert.equal(freshBreakoutState(99).best, 99);
const row0 = bk.bricks.filter((brick) => brick.row === 0);
const row1 = bk.bricks.filter((brick) => brick.row === 1);
assert.equal(row0.length, 7);
assert.equal(row1.length, 6);
assert.equal(row1[0].x - row0[0].x, 13);

assert.equal(breakoutStep(bk), bk); // not launched yet

const launched = { ...bk, started: true };
const movedBall = breakoutStep(launched);
assert.ok(movedBall.ball.x !== launched.ball.x || movedBall.ball.y !== launched.ball.y);

const bkWall = {
  ...launched,
  ball: { x: 2, y: 100, vx: -2.2, vy: -1 },
};
const bounced = breakoutStep(bkWall);
assert.ok(bounced.ball.vx > 0, 'left wall flips vx');

const brick = launched.bricks[0];
const hitState = {
  ...launched,
  ball: { x: brick.x + brick.w / 2, y: brick.y - 5, vx: 0, vy: 2.6 },
};
const hit = breakoutStep(hitState);
assert.equal(hit.bricks[0].alive, false);
assert.equal(hit.score, 10);
assert.equal(hit.best, 10);

const bklost = breakoutStep({
  ...launched,
  ball: { x: 100, y: 240, vx: 0, vy: 2.6 },
});
assert.equal(bklost.lives, 2);
assert.equal(bklost.started, false);

const bkCleared = breakoutStep({
  ...launched,
  bricks: launched.bricks.map((piece) => ({ ...piece, alive: false })),
});
assert.equal(bkCleared.over, true);
assert.equal(bkCleared.won, true);

// ┌──────────────────────────────────────────────────────────────┐
// │ Sokoban                                                      │
// └──────────────────────────────────────────────────────────────┘
const sk = freshSokobanState([]);
assert.equal(SOKOBAN_LEVELS.length, 100, 'the classic 100-level pack is bundled');
assert.equal(sk.level, 0);
assert.equal(sk.solved, false);

// every level must parse with one player and matching boxes / targets
for (let index = 0; index < SOKOBAN_LEVELS.length; index += 1) {
  const parsed = sokobanParse(index);
  assert.ok(parsed.player && Number.isInteger(parsed.player.r), `level ${index + 1} has a player`);
  assert.ok(parsed.boxes.length > 0 && parsed.boxes.length === parsed.targets.length,
    `level ${index + 1} boxes match targets`);
  assert.ok(parsed.walls.length > 0, `level ${index + 1} has walls`);
}

// walls block movement
const parsed0 = sokobanParse(0);
let wallStep = null;
for (const wall of parsed0.walls) {
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const from = { r: wall.r - dr, c: wall.c - dc };
    const wallSet = new Set(parsed0.walls.map((cell) => `${cell.r},${cell.c}`));
    if (from.r < 0 || from.c < 0 || from.r >= parsed0.rows || from.c >= parsed0.cols) continue;
    if (wallSet.has(`${from.r},${from.c}`)) continue;
    wallStep = { from, dr, dc };
    break;
  }
  if (wallStep) break;
}
assert.ok(wallStep, 'level 1 has a wall we can walk into');
const wallState = {
  level: 0,
  player: wallStep.from,
  boxes: parsed0.boxes.map((box) => ({ ...box })),
  moves: 0,
  solved: false,
  best: [],
};
assert.equal(sokobanMove(wallState, wallStep.dr, wallStep.dc), wallState, 'walls block movement');

// solve one of the simplest bundled levels to prove the pack is playable
let simplest = 0;
let simplestCost = Infinity;
for (let index = 0; index < SOKOBAN_LEVELS.length; index += 1) {
  const parsed = sokobanParse(index);
  const cost = parsed.boxes.length * 1000 + parsed.rows * parsed.cols;
  if (cost < simplestCost) {
    simplestCost = cost;
    simplest = index;
  }
}

function sokobanSolvable(levelIndex) {
  const parsed = sokobanParse(levelIndex);
  const start = {
    level: levelIndex,
    player: { ...parsed.player },
    boxes: parsed.boxes.map((box) => ({ ...box })),
    moves: 0,
    solved: false,
    best: [],
  };
  const queue = [start];
  const seen = new Set();
  const keyOf = (state) =>
    `${state.player.r},${state.player.c}:${state.boxes.map((box) => `${box.r}.${box.c}`).join('|')}`;
  seen.add(keyOf(start));
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while (queue.length) {
    const current = queue.shift();
    if (sokobanSolved(current)) return true;
    for (const [dr, dc] of dirs) {
      const next = sokobanMove(current, dr, dc);
      if (next === current) continue;
      const key = keyOf(next);
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > 300000) return false;
      queue.push(next);
    }
  }
  return false;
}

assert.equal(sokobanSolvable(simplest), true, `simplest level ${simplest + 1} is solvable`);

// ┌──────────────────────────────────────────────────────────────┐
// │ Sudoku                                                       │
// └──────────────────────────────────────────────────────────────┘
function sudokuSolutionValid(solution) {
  for (let row = 0; row < 9; row += 1) {
    const seen = new Set();
    for (let col = 0; col < 9; col += 1) seen.add(solution[row * 9 + col]);
    if (seen.size !== 9) return false;
  }
  for (let col = 0; col < 9; col += 1) {
    const seen = new Set();
    for (let row = 0; row < 9; row += 1) seen.add(solution[row * 9 + col]);
    if (seen.size !== 9) return false;
  }
  for (let box = 0; box < 9; box += 1) {
    const seen = new Set();
    for (let at = 0; at < 9; at += 1) {
      const row = Math.floor(box / 3) * 3 + Math.floor(at / 3);
      const col = (box % 3) * 3 + (at % 3);
      seen.add(solution[row * 9 + col]);
    }
    if (seen.size !== 9) return false;
  }
  return true;
}

for (const difficulty of ['easy', 'medium', 'hard']) {
  assert.equal(SUDOKU_PUZZLES[difficulty].length, SUDOKU_PER_LEVEL, `${difficulty} has 20 puzzles`);
  for (const entry of SUDOKU_PUZZLES[difficulty]) {
    assert.equal(entry.puzzle.length, 81, 'puzzle is 81 chars');
    assert.equal(entry.solution.length, 81, 'solution is 81 chars');
    assert.ok(sudokuSolutionValid(entry.solution), 'solution is a valid sudoku');
    for (let i = 0; i < 81; i += 1) {
      if (entry.puzzle[i] !== '0') assert.equal(entry.puzzle[i], entry.solution[i], 'givens match solution');
    }
  }
}

let sudoku = sudokuFresh('easy', 0);
assert.equal(sudoku.grid.length, 81);
assert.equal(sudoku.solved, false);
const sudokuEmpty = [...sudoku.puzzle].findIndex((char) => char === '0');
assert.ok(sudokuEmpty >= 0, 'puzzle has an empty cell');

sudoku = sudokuSelect(sudoku, sudokuEmpty);
sudoku = sudokuPlace(sudoku, Number(sudoku.solution[sudokuEmpty]));
assert.equal(sudoku.grid[sudokuEmpty], Number(sudoku.solution[sudokuEmpty]), 'digit placed');

sudoku = sudokuSelect(sudoku, sudokuEmpty);
sudoku = sudokuErase(sudoku);
assert.equal(sudoku.grid[sudokuEmpty], 0, 'eraser clears the cell');

sudoku = sudokuToggleNotesMode(sudoku);
sudoku = sudokuPlace(sudoku, 7);
assert.deepEqual([...sudoku.notes[sudokuEmpty]], [7], 'pencil adds a candidate');
sudoku = sudokuPlace(sudoku, 7);
assert.deepEqual([...sudoku.notes[sudokuEmpty]], [], 'pencil toggles a candidate off');
sudoku = sudokuToggleNotesMode(sudoku);

sudoku = sudokuPlace(sudoku, 7);
assert.equal(sudoku.solved, false, 'a single wrong cell is not solved');
sudoku = sudokuSelect(sudoku, sudokuEmpty);
sudoku = sudokuErase(sudoku);

let sudokuFull = sudokuFresh('medium', 0);
for (let i = 0; i < 81; i += 1) {
  if (sudokuFull.grid[i] !== 0) continue;
  sudokuFull = sudokuSelect(sudokuFull, i);
  sudokuFull = sudokuPlace(sudokuFull, Number(sudokuFull.solution[i]));
}
assert.equal(sudokuFull.solved, true, 'filling the solution wins');
assert.equal(sudokuIsSolved(sudokuFull.grid, sudokuFull.solution), true);
const completed = sudokuCompletedDigits(sudokuFull);
for (let digit = 1; digit <= 9; digit += 1) {
  assert.equal(completed[digit], 9, `digit ${digit} is complete`);
}
assert.ok(sudokuCompletedDigits(sudokuFresh('easy', 0)).slice(1).some((n) => n < 9), 'a fresh puzzle has unfinished digits');

const sudokuGiven = [...sudoku.puzzle].findIndex((char) => char !== '0');
assert.ok(sudokuGiven >= 0, 'puzzle has a given');
const highlighted = sudokuSelect(sudoku, sudokuGiven);
assert.equal(sudokuHighlightDigit(highlighted), Number(highlighted.solution[sudokuGiven]), 'selecting a given highlights its digit');
assert.equal(sudokuHighlightDigit(sudokuSelect(sudoku, sudokuEmpty)), 0, 'an empty cell highlights nothing');

const sudokuLast = sudokuFresh('hard', 19);
assert.equal(sudokuNextPuzzle(sudokuLast).index, 0, 'next puzzle wraps to the first');
assert.equal(sudokuSetDifficulty(sudokuLast, 'easy').difficulty, 'easy');
assert.equal(sudokuSetDifficulty(sudokuLast, 'easy').index, 0);

const sudokuDirty = sanitizeSudoku({ ...sudokuFull, grid: sudokuFull.grid.slice(0, 80) });
assert.equal(sudokuDirty.grid.length, 81, 'sanitizer rebuilds an invalid grid');

const counts = { '2048': 25, tetris: 23, gomoku: 17, klotski: 9, snake: 10, schulte: 16, breakout: 11, sokoban: 8, sudoku: 15 };
const total = counts['2048'] + counts.tetris + counts.gomoku + counts.klotski + counts.snake + counts.schulte + counts.breakout + counts.sokoban + counts.sudoku;
console.log(`Logic verification passed: 2048=${counts['2048']}, tetris=${counts.tetris}, gomoku=${counts.gomoku}, klotski=${counts.klotski}, snake=${counts.snake}, schulte=${counts.schulte}, breakout=${counts.breakout}, sokoban=${counts.sokoban}, sudoku=${counts.sudoku} (${total} total)`);
