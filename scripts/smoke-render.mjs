#!/usr/bin/env node
/**
 * Render smoke test: invokes the real components with a tiny hook runtime so
 * render-time ReferenceErrors surface without restarting the desktop client.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

let caught = null;
const windowStub = {
  localStorage: {
    data: new Map(),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, String(v)); },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  __ModuleLoader__: { load(cfg) { caught = cfg; } },
};

let currentRuntime = null;

const ReactStub = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity) };
  },
  useState(init) { return currentRuntime.useState(init); },
  useRef(init) { return currentRuntime.useRef(init); },
  useCallback(fn) { return currentRuntime.useCallback(fn); },
  useEffect(fn) { return currentRuntime.useEffect(fn); },
};

const sandbox = {
  window: windowStub,
  globalThis: {},
  console,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  clearTimeout: () => {},
  require: (name) => {
    if (name === 'react') return ReactStub;
    throw new Error(`unexpected require ${name}`);
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

function makeRuntime() {
  const cells = [];
  const effects = [];
  let index = 0;
  return {
    useState(init) {
      const i = index++;
      if (!(i in cells)) cells[i] = { value: typeof init === 'function' ? init() : init };
      return [cells[i].value, (next) => { cells[i].value = typeof next === 'function' ? next(cells[i].value) : next; }];
    },
    useRef(init) {
      const i = index++;
      if (!(i in cells)) cells[i] = { current: init };
      return cells[i];
    },
    useCallback(fn) { index += 1; return fn; },
    useEffect(fn) { const i = index++; effects.push(fn); },
    reset() { index = 0; },
    effects,
  };
}

function instantiate(Comp, props) {
  const runtime = makeRuntime();
  const previous = currentRuntime;
  currentRuntime = runtime;
  try {
    runtime.reset();
    let tree = Comp(props);
    for (const effect of runtime.effects.slice()) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    }
    return tree;
  } finally {
    currentRuntime = previous;
  }
}

function collectText(node, out = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out; }
  if (node.type && typeof node.type === 'function') {
    collectText(instantiate(node.type, node.props), out);
    return out;
  }
  collectText(node.children, out);
  return out;
}

assert.ok(caught, 'module loader was not invoked');
const plugin = caught.factory(sandbox.require);
const { GameShell, GameCard, Game2048, GameTetris, GameGomoku, GameBreakout } = plugin.__components;

// 1. Shell renders 2048 with score/best chips.
windowStub.localStorage.data.clear();
let text = collectText(instantiate(GameShell, {})).join(' ');
assert.ok(text.includes('2048'), 'shell shows 2048 toggle');
assert.ok(text.includes('分数'), 'shell shows score chip');
assert.ok(text.includes('最高'), 'shell shows best chip');
assert.ok(text.includes('Tetris'), 'shell shows tetris toggle');
for (const label of ['五子棋', '华容道', '贪吃蛇', '舒尔特', '打砖块', '推箱子']) {
  assert.ok(text.includes(label), `shell shows ${label} toggle`);
}

// 2. Tetris mode renders score/lines/level and next-piece label.
let tetrisText = collectText(instantiate(GameCard, {
  saved: { active: 'tetris', '2048': null, tetris: null },
  setSaved: () => {},
  focused: true,
  setFocused: () => {},
  onCollapse: () => {},
})).join(' ');
for (const label of ['最高', '分数', '消行', '等级', '下一块', '点击开始']) {
  assert.ok(tetrisText.includes(label), `tetris shows ${label}`);
}

// 3. Mid-animation duplicate tiles are sanitized without throwing.
let midText = collectText(instantiate(Game2048, {
  initial: {
    tiles: [
      { id: 1, value: 2, row: 0, column: 0 },
      { id: 2, value: 2, row: 0, column: 0 },
    ],
    score: 4,
    best: 4,
    over: false,
    won: false,
  },
  onChange: () => {},
  focused: false,
})).join(' ');
assert.ok(midText.includes('分数'));
assert.ok(midText.includes('最高'));

// 4. Fresh tetris component renders 200 board cells.
const tetrisTree = instantiate(GameTetris, { initial: null, onChange: () => {}, focused: false });
let divCount = 0;
(function count(node) {
  if (!node) return;
  if (Array.isArray(node)) { node.forEach(count); return; }
  if (typeof node !== 'object') return;
  if (node.type === 'div') divCount += 1;
  count(node.children);
})(tetrisTree);
assert.ok(divCount >= 200, `tetris board rendered ${divCount} cells`);


// 5. New games render their own info rows and boards.
const zeroReset = { '2048': 0, tetris: 0, gomoku: 0, klotski: 0, snake: 0 };
function cardText(game) {
  return collectText(instantiate(GameCard, {
    saved: {
      active: game,
      '2048': null,
      tetris: null,
      gomoku: null,
      klotski: null,
      snake: null,
      reset: zeroReset,
    },
    setSaved: () => {},
    focused: false,
    setFocused: () => {},
    onCollapse: () => {},
  })).join(' ');
}

const gomokuText = cardText('gomoku');
for (const label of ['执子', '步数', '难度']) assert.ok(gomokuText.includes(label), `gomoku shows ${label}`);

const klotskiText = cardText('klotski');
for (const label of ['步数', '状态']) assert.ok(klotskiText.includes(label), `klotski shows ${label}`);

const snakeText = cardText('snake');
for (const label of ['分数', '最高']) assert.ok(snakeText.includes(label), `snake shows ${label}`);

const sokobanText = cardText('sokoban');
for (const label of ['关卡', '步数', '最佳']) assert.ok(sokobanText.includes(label), `sokoban shows ${label}`);

const breakoutText = cardText('breakout');
for (const label of ['分数', '生命', '最高', '点击发球', '控制挡板']) assert.ok(breakoutText.includes(label), `breakout shows ${label}`);

const breakoutTree = instantiate(GameBreakout, { initial: null, onChange: () => {}, focused: false, active: true });
let paddle = false;
let ball = false;
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  const style = node.props && node.props.style;
  if (style && style.background === '#4aa3ff') paddle = true;
  if (style && style.borderRadius === '50%' && style.width === 8) ball = true;
  walk(node.children);
})(breakoutTree);
assert.ok(paddle, 'breakout paddle is rendered');
assert.ok(ball, 'breakout ball is rendered');

const schulteText = cardText('schulte');
for (const label of ['进度', '用时', '最佳', '棋盘']) assert.ok(schulteText.includes(label), `schulte shows ${label}`);

// 6. Gomoku actually renders a full 15x15 board with a visible background.
const gomokuTree = instantiate(GameGomoku, { initial: null, onChange: () => {}, focused: false, active: true });
let gomokuCells = 0;
let gomokuBoard = false;
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (node.type === 'button') gomokuCells += 1;
  if (node.props && node.props.style && node.props.style.background === '#dcb47c') gomokuBoard = true;
  walk(node.children);
})(gomokuTree);
assert.ok(gomokuBoard, 'gomoku board background missing');
assert.ok(gomokuCells >= 225, `gomoku rendered ${gomokuCells} cells`);

console.log(`render smoke passed: shell+tabs, tetris, gomoku, klotski, snake, schulte, ${divCount} tetris cells`);
