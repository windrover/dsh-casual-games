/**
 * DSH games card — a persistent bottom-left mini-game card for DeepSeek Harness.
 *
 * Sections: card shell styles · 2048 · Tetris · Gomoku · Klotski · Snake ·
 *           Schulte table · Breakout · card shell component · host bridge.
 * The Host half (index.js) watches `agent/status` and serves
 * /api/dsh-casual-games/status; the card auto-expands during long agent runs.
 */
window.__ModuleLoader__.load({
  id: 'dsh-casual-games',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Card shell constants and styles                              │
    // └──────────────────────────────────────────────────────────────┘
    function isTypingTarget(target) {
      const element = target || (typeof document === 'undefined' ? null : document.activeElement);
      if (!element) return false;
      const tag = element.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true;
    }

    const CARD_WIDTH = 240;
    const GAME_BODY_H = 275;
    const SIDEBAR_HIDDEN_CSS = '[data-sidebar-collapsed] .dshcg-root { display: none !important; }';
    const STORE_KEY = 'dsh.games.v2';

    const cardStyle = {
      position: 'fixed',
      left: 12,
      bottom: 72,
      width: CARD_WIDTH,
      zIndex: 60,
      pointerEvents: 'auto',
      boxSizing: 'border-box',
      background: 'var(--dsw-alias-bg-overlay)',
      color: 'var(--dsw-alias-label-primary)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 12,
      padding: 10,
      fontFamily: 'system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif',
      outline: 'none',
      userSelect: 'none',
      overflow: 'hidden',
      contain: 'paint',
      maxWidth: 'calc(100vw - 24px)',
    };

    const pillStyle = {
      position: 'fixed',
      left: 12,
      bottom: 72,
      maxWidth: 'calc(100vw - 24px)',
      zIndex: 60,
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      borderRadius: 999,
      background: 'var(--dsw-alias-bg-overlay)',
      color: 'var(--dsw-alias-label-primary)',
      border: '1px solid var(--dsw-alias-border-l1)',
      fontFamily: 'system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
    };

    const headStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 2px 8px',
    };

    const iconButtonStyle = {
      border: 'none',
      background: 'transparent',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: 12,
      lineHeight: 1,
      padding: '1px 2px',
      borderRadius: 6,
      cursor: 'pointer',
    };

    const chipRowStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      padding: '0 2px',
    };

    const chipStyle = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: 46,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'var(--dsw-alias-bg-layer-2)',
      lineHeight: 1.15,
    };

    const chipLabelStyle = {
      fontSize: 9,
      color: 'var(--dsw-alias-label-secondary)',
      letterSpacing: 0.4,
    };

    const chipValueStyle = { fontSize: 12, fontWeight: 700 };

    const hintStyle = {
      marginTop: 6,
      fontSize: 10,
      textAlign: 'center',
      color: 'var(--dsw-alias-label-secondary)',
    };

    const overlayStyle = (background, color) => ({
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      background,
      color: color || '#776e65',
      fontSize: 14,
      fontWeight: 800,
      zIndex: 5,
    });

    const againButtonStyle = {
      border: 'none',
      borderRadius: 8,
      padding: '6px 14px',
      background: '#8f7a66',
      color: '#f9f6f2',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer',
    };

    function chips(entries) {
      return h('div', { style: chipRowStyle }, entries.map((entry) =>
        h('div', { key: entry.label, style: chipStyle }, [
          h('span', { key: 'l', style: chipLabelStyle }, entry.label),
          h('span', { key: 'v', style: chipValueStyle }, String(entry.value)),
        ])));
    }

    function sideChips(entries) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } }, entries.map((entry) =>
        h('div', {
          key: entry.label,
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            padding: '1px 5px',
            borderRadius: 5,
            background: 'var(--dsw-alias-bg-layer-2)',
            lineHeight: 1.2,
          },
        }, [
          h('span', { key: 'l', style: { fontSize: 9, color: 'var(--dsw-alias-label-secondary)' } }, entry.label),
          h('span', { key: 'v', style: { fontSize: 11, fontWeight: 700 } }, String(entry.value)),
        ])));
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ 2048                                                         │
    // └──────────────────────────────────────────────────────────────┘
    const SIZE = 4;
    const ANIM_MS = 130;
    const BOARD_SIZE = 218;
    const BOARD_PAD = 6;
    const GAP = 6;
    const CELL = 47;
    const STRIDE = CELL + GAP;

    let tileSeq = 1;

    function makeTile(value, row, column, extra) {
      const tile = { id: tileSeq, value, row, column };
      tileSeq += 1;
      return Object.assign(tile, extra);
    }

    const TILE_STYLE = {
      2: { background: '#eee4da', color: '#776e65' },
      4: { background: '#ede0c8', color: '#776e65' },
      8: { background: '#f2b179', color: '#f9f6f2' },
      16: { background: '#f59563', color: '#f9f6f2' },
      32: { background: '#f67c5f', color: '#f9f6f2' },
      64: { background: '#f65e3b', color: '#f9f6f2' },
      128: { background: '#edcf72', color: '#f9f6f2' },
      256: { background: '#edcc61', color: '#f9f6f2' },
      512: { background: '#edc850', color: '#f9f6f2' },
      1024: { background: '#edc53f', color: '#f9f6f2' },
      2048: { background: '#edc22e', color: '#f9f6f2' },
    };

    function boardFromTiles(tiles) {
      const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      for (const tile of tiles) {
        if (tile.row >= 0 && tile.row < SIZE && tile.column >= 0 && tile.column < SIZE) {
          board[tile.row][tile.column] += tile.value;
        }
      }
      return board;
    }

    function tilesFromBoard(board) {
      const tiles = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          if (board[row][column]) tiles.push(makeTile(board[row][column], row, column));
        }
      }
      return tiles;
    }

    function canMove(board) {
      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          const value = board[row][column];
          if (!value) return true;
          if (column + 1 < SIZE && board[row][column + 1] === value) return true;
          if (row + 1 < SIZE && board[row + 1][column] === value) return true;
        }
      }
      return false;
    }

    function isBoard(value) {
      if (!Array.isArray(value) || value.length !== SIZE) return false;
      return value.every((row) =>
        Array.isArray(row) &&
        row.length === SIZE &&
        row.every((cell) => Number.isInteger(cell) && cell >= 0),
      );
    }

    function spawnRandom(tiles) {
      const occupied = new Set(tiles.map((tile) => tile.row * SIZE + tile.column));
      const empty = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          if (!occupied.has(row * SIZE + column)) empty.push({ row, column });
        }
      }
      if (!empty.length) return null;
      const cell = empty[Math.floor(Math.random() * empty.length)];
      return makeTile(Math.random() < 0.9 ? 2 : 4, cell.row, cell.column, { isNew: true });
    }

    function cellAt(direction, line, index) {
      if (direction === 'right') return { row: line, column: SIZE - 1 - index };
      if (direction === 'up') return { row: index, column: line };
      if (direction === 'down') return { row: SIZE - 1 - index, column: line };
      return { row: line, column: index };
    }

    function computeMove(tiles, direction) {
      const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      for (const tile of tiles) {
        if (tile.row >= 0 && tile.row < SIZE && tile.column >= 0 && tile.column < SIZE) {
          grid[tile.row][tile.column] = tile;
        }
      }
      const next = [];
      const merges = [];
      let gained = 0;
      let moved = false;
      for (let line = 0; line < SIZE; line += 1) {
        const ordered = [];
        for (let step = 0; step < SIZE; step += 1) {
          const cell = cellAt(direction, line, step);
          const tile = grid[cell.row][cell.column];
          if (tile) ordered.push(tile);
        }
        let target = 0;
        for (let index = 0; index < ordered.length; index += 1) {
          const tile = ordered[index];
          const pair = ordered[index + 1];
          const targetCell = cellAt(direction, line, target);
          if (pair && pair.value === tile.value) {
            next.push({ ...tile, row: targetCell.row, column: targetCell.column });
            next.push({ ...pair, row: targetCell.row, column: targetCell.column });
            merges.push({
              ids: [tile.id, pair.id],
              value: tile.value * 2,
              row: targetCell.row,
              column: targetCell.column,
            });
            gained += tile.value * 2;
            moved = true;
            index += 1;
          } else {
            next.push({ ...tile, row: targetCell.row, column: targetCell.column });
            if (tile.row !== targetCell.row || tile.column !== targetCell.column) moved = true;
          }
          target += 1;
        }
      }
      return { tiles: next, merges, gained, moved };
    }

    function fresh2048State(best) {
      const first = spawnRandom([]);
      const second = spawnRandom(first ? [first] : []);
      return {
        tiles: second ? [first, second] : first ? [first] : [],
        score: 0,
        best: Number(best) || 0,
        over: false,
        won: false,
      };
    }

    // Collapse a mid-animation snapshot (two tiles on one cell sum to the merged value).
    function sanitize2048(state) {
      if (!state || !Array.isArray(state.tiles)) return null;
      const tiles = state.tiles.filter((tile) =>
        tile && Number.isFinite(tile.value) &&
        Number.isInteger(tile.row) && tile.row >= 0 && tile.row < SIZE &&
        Number.isInteger(tile.column) && tile.column >= 0 && tile.column < SIZE,
      );
      if (!tiles.length) return null;
      const board = boardFromTiles(tiles);
      return {
        tiles: tilesFromBoard(board),
        score: Number(state.score) || 0,
        best: Math.max(Number(state.best) || 0, Number(state.score) || 0),
        over: Boolean(state.over),
        won: Boolean(state.won),
      };
    }

    const TILE_CSS = [
      '.dshg-new{animation:dshg-appear 150ms ease-out}',
      '.dshg-pop{animation:dshg-pop 150ms ease-out}',
      '.dshg-fade{animation:dshg-fade 140ms ease-out}',
      '.dshg-flash{animation:dshg-flash 180ms ease-out}',
      '@keyframes dshg-appear{from{transform:scale(0)}to{transform:scale(1)}}',
      '@keyframes dshg-pop{0%{transform:scale(1)}45%{transform:scale(1.18)}100%{transform:scale(1)}}',
      '@keyframes dshg-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes dshg-flash{0%{opacity:0.95}60%{opacity:0.5}100%{opacity:0}}',
      '@media (prefers-reduced-motion: reduce){.dshg-new,.dshg-pop,.dshg-fade,.dshg-flash,.dshsch-rot,.dshsch-counter{animation:none}}',
    ].join('\n');

    function Game2048({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitize2048(initial) || fresh2048State(0));
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const busy = useRef(false);
      const timer = useRef(null);
      const touch = useRef(null);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
      }, []);

      const commit = useCallback((next) => {
        stateRef.current = next;
        setState(next);
        if (onChangeRef.current) onChangeRef.current(next);
      }, []);

      const finalize = useCallback((merges) => {
        const current = stateRef.current;
        const removed = new Set();
        for (const merge of merges) {
          for (const id of merge.ids) removed.add(id);
        }
        const tiles = current.tiles.filter((tile) => !removed.has(tile.id));
        for (const merge of merges) {
          tiles.push(makeTile(merge.value, merge.row, merge.column, { pop: true }));
        }
        const spawned = spawnRandom(tiles);
        if (spawned) tiles.push(spawned);
        const board = boardFromTiles(tiles);
        commit({
          ...current,
          tiles,
          over: !canMove(board),
          won: current.won || board.some((row) => row.some((value) => value >= 2048)),
        });
        busy.current = false;
        timer.current = null;
      }, [commit]);

      const move = useCallback((direction) => {
        const current = stateRef.current;
        if (busy.current || current.over) return;
        const result = computeMove(current.tiles, direction);
        if (!result.moved) return;
        busy.current = true;
        const score = current.score + result.gained;
        commit({
          ...current,
          tiles: result.tiles,
          score,
          best: Math.max(current.best, score),
        });
        timer.current = setTimeout(() => finalize(result.merges), ANIM_MS);
      }, [commit, finalize]);

      const restart = useCallback(() => {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        busy.current = false;
        commit(fresh2048State(stateRef.current.best));
      }, [commit]);

      useEffect(() => {
        if (!focused || !active) return undefined;
        const onKeyDown = (event) => {
          if (isTypingTarget(event.target)) return;
          const directions = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'up',
            ArrowDown: 'down',
          };
          const direction = directions[event.key];
          if (!direction) return;
          event.preventDefault();
          move(direction);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [focused, active, move]);

      const onTouchStart = useCallback((event) => {
        const point = event.touches[0];
        if (point) touch.current = { x: point.clientX, y: point.clientY };
      }, []);

      const onTouchEnd = useCallback((event) => {
        const start = touch.current;
        touch.current = null;
        const point = event.changedTouches[0];
        if (!start || !point) return;
        const dx = point.clientX - start.x;
        const dy = point.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        move(Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up'));
      }, [move]);

      const cells = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let column = 0; column < SIZE; column += 1) {
          cells.push(h('div', {
            key: `bg-${row}-${column}`,
            style: {
              position: 'absolute',
              width: CELL,
              height: CELL,
              borderRadius: 6,
              background: 'rgba(238, 228, 218, 0.35)',
              left: BOARD_PAD + column * STRIDE,
              top: BOARD_PAD + row * STRIDE,
            },
          }));
        }
      }

      const tiles = state.tiles.map((tile) => {
        const palette = TILE_STYLE[tile.value] || { background: '#3c3a32', color: '#f9f6f2' };
        return h('div', {
          key: tile.id,
          style: {
            position: 'absolute',
            left: 0,
            top: 0,
            width: CELL,
            height: CELL,
            transform: `translate(${BOARD_PAD + tile.column * STRIDE}px, ${BOARD_PAD + tile.row * STRIDE}px)`,
            transition: 'transform 120ms cubic-bezier(.2,.8,.3,1)',
            willChange: 'transform',
          },
        }, h('div', {
          className: `${tile.isNew ? 'dshg-new' : ''}${tile.pop ? ' dshg-pop' : ''}`.trim() || undefined,
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            borderRadius: 6,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            ...palette,
            fontSize: tile.value < 100 ? 20 : tile.value < 1000 ? 17 : 14,
          },
        }, String(tile.value)));
      });

      return h('div', {
        style: { position: 'relative' },
        onTouchStart,
        onTouchEnd,
      }, [
        h('style', { key: 'css' }, TILE_CSS),
        h('div', { key: 'chips' }, chips([
          { label: '分数', value: state.score },
          { label: '最高', value: state.best },
        ])),
        h('div', { key: 'board', style: boardStyle2048 }, [
          ...cells,
          ...tiles,
          state.over
            ? h('div', { key: 'over', style: overlayStyle('rgba(238, 228, 218, 0.82)') }, [
                h('div', { key: 'text', style: { marginBottom: 8 } }, '游戏结束'),
                h('button', {
                  key: 'again',
                  type: 'button',
                  style: againButtonStyle,
                  onClick: restart,
                }, '再来一局'),
              ])
            : null,
        ]),
        h('div', { key: 'hint', style: hintStyle },
          focused ? '方向键操控' : '点击卡片后方向键操控'),
      ]);
    }

    const boardStyle2048 = {
      position: 'relative',
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      boxSizing: 'border-box',
      borderRadius: 10,
      background: '#bbada0',
      touchAction: 'none',
    };

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Tetris                                                       │
    // └──────────────────────────────────────────────────────────────┘
    const COLS = 10;
    const ROWS = 20;
    const CELL_T = 12;
    const GAP_T = 1;
    const STRIDE_T = CELL_T + GAP_T;
    const BOARD_W_T = COLS * CELL_T + (COLS - 1) * GAP_T;
    const BOARD_H_T = ROWS * CELL_T + (ROWS - 1) * GAP_T;

    const TETROMINOES = {
      I: { shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: '#00f0f0' },
      J: { shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: '#4060ff' },
      L: { shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: '#f0a000' },
      O: { shape: [[1, 1], [1, 1]], color: '#f0f000' },
      S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: '#00f000' },
      T: { shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: '#a000f0' },
      Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: '#f00000' },
    };
    const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
    const SCORE_TABLE = [0, 100, 300, 500, 800];

    function rotateShape(shape) {
      return shape[0].map((_, index) => shape.map((row) => row[index]).reverse());
    }

    function getShape(type, rotation) {
      let shape = TETROMINOES[type].shape;
      for (let index = 0; index < rotation; index += 1) shape = rotateShape(shape);
      return shape;
    }

    function pieceCells(type, rotation, x, y) {
      const shape = getShape(type, rotation);
      const cells = [];
      for (let row = 0; row < shape.length; row += 1) {
        for (let column = 0; column < shape[row].length; column += 1) {
          if (shape[row][column]) cells.push({ r: y + row, c: x + column });
        }
      }
      return cells;
    }

    function emptyTetrisBoard() {
      return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    function collides(board, cells) {
      for (const cell of cells) {
        if (cell.c < 0 || cell.c >= COLS || cell.r >= ROWS) return true;
        if (cell.r >= 0 && board[cell.r][cell.c]) return true;
      }
      return false;
    }

    function clearLines(board) {
      let cleared = 0;
      let row = ROWS - 1;
      while (row >= 0) {
        if (board[row].every((cell) => cell)) {
          board.splice(row, 1);
          board.unshift(Array(COLS).fill(0));
          cleared += 1;
        } else {
          row -= 1;
        }
      }
      return cleared;
    }

    function randomPiece() {
      return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    }

    function freshTetrisState() {
      return {
        board: emptyTetrisBoard(),
        piece: { type: randomPiece(), x: Math.floor(COLS / 2) - 1, y: 0, rotation: 0 },
        next: randomPiece(),
        score: 0,
        best: 0,
        lines: 0,
        level: 1,
        gameOver: false,
        paused: false,
        started: false,
        pieceId: 1,
      };
    }

    function sanitizeTetris(state) {
      if (!state || !Array.isArray(state.board) || state.board.length !== ROWS) return null;
      const boardOk = state.board.every((row) =>
        Array.isArray(row) && row.length === COLS &&
        row.every((cell) => typeof cell === 'string' || cell === 0 || cell === null || cell === undefined),
      );
      if (!boardOk) return null;
      const board = state.board.map((row) => row.map((cell) => (cell || 0)));
      const piece = state.piece && TETROMINOES[state.piece.type]
        ? { type: state.piece.type, x: Number(state.piece.x) || 0, y: Number(state.piece.y) || 0, rotation: Number(state.piece.rotation) % 4 || 0 }
        : { type: randomPiece(), x: Math.floor(COLS / 2) - 1, y: 0, rotation: 0 };
      return {
        board,
        piece,
        next: TETROMINOES[state.next] ? state.next : randomPiece(),
        score: Number(state.score) || 0,
        best: Math.max(Number(state.best) || 0, Number(state.score) || 0),
        lines: Number(state.lines) || 0,
        level: Math.max(1, Number(state.level) || 1),
        gameOver: Boolean(state.gameOver),
        paused: Boolean(state.paused),
        started: false,
        pieceId: Number(state.pieceId) || 1,
      };
    }

    const tetrisBoardStyle = {
      position: 'relative',
      alignSelf: 'center',
      width: BOARD_W_T + 2,
      height: BOARD_H_T + 2,
      boxSizing: 'border-box',
      borderRadius: 8,
      background: '#0b1016',
      border: '1px solid var(--dsw-alias-border-l1)',
      overflow: 'hidden',
      touchAction: 'none',
    };

    const tetrisGridStyle = {
      display: 'grid',
      gridTemplateColumns: `repeat(${COLS}, ${CELL_T}px)`,
      gridTemplateRows: `repeat(${ROWS}, ${CELL_T}px)`,
      gap: GAP_T,
    };

    function renderBoardCell(board, row, col) {
      const type = board[row][col];
      return h('div', {
        key: `t-${row}-${col}`,
        style: {
          width: CELL_T,
          height: CELL_T,
          borderRadius: 3,
          background: type ? (TETROMINOES[type] ? TETROMINOES[type].color : '#555') : '#1a1a1a',
          boxSizing: 'border-box',
          border: type ? '1px solid rgba(255,255,255,0.18)' : 'none',
          transition: 'background-color 120ms ease-out',
        },
      });
    }

    function renderPieceCell(type, row, col) {
      return h('div', {
        key: `p-${row}-${col}`,
        style: {
          width: CELL_T,
          height: CELL_T,
          borderRadius: 3,
          background: TETROMINOES[type].color,
          boxSizing: 'border-box',
          border: '1px solid rgba(255,255,255,0.25)',
        },
      });
    }

    function renderMiniPiece(type, seed) {
      const shape = getShape(type, 0);
      let minRow = shape.length;
      let maxRow = -1;
      let minCol = shape[0].length;
      let maxCol = -1;
      for (let row = 0; row < shape.length; row += 1) {
        for (let col = 0; col < shape[row].length; col += 1) {
          if (shape[row][col]) {
            if (row < minRow) minRow = row;
            if (row > maxRow) maxRow = row;
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
          }
        }
      }
      const rows = maxRow - minRow + 1;
      const cols = maxCol - minCol + 1;
      const unit = 9;
      const cells = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const filled = shape[minRow + row][minCol + col];
          cells.push(h('div', {
            key: `${row}-${col}`,
            style: {
              width: unit,
              height: unit,
              borderRadius: 1,
              background: filled ? TETROMINOES[type].color : 'transparent',
            },
          }));
        }
      }
      return h('div', {
        key: `mini-${type}-${seed}`,
        className: 'dshg-fade',
        style: {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${unit}px)`,
          gap: 1,
          padding: 2,
          borderRadius: 4,
          background: '#0b1016',
          border: '1px solid var(--dsw-alias-border-l1)',
          width: 'fit-content',
        },
      }, cells);
    }

    function GameTetris({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeTetris(initial) || freshTetrisState());
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const tick = useRef(0);
      const touch = useRef(null);
      const flashTimer = useRef(null);
      const activeRef = useRef(active);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        activeRef.current = active;
      }, [active]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      useEffect(() => () => {
        if (flashTimer.current) clearTimeout(flashTimer.current);
      }, []);

      const commit = useCallback((next) => {
        stateRef.current = next;
        setState(next);
        if (onChangeRef.current) onChangeRef.current(next);
      }, []);

      const lock = useCallback((current) => {
        const nextBoard = current.board.map((row) => row.slice());
        for (const cell of pieceCells(current.piece.type, current.piece.rotation, current.piece.x, current.piece.y)) {
          if (cell.r >= 0 && cell.r < ROWS && cell.c >= 0 && cell.c < COLS) {
            nextBoard[cell.r][cell.c] = current.piece.type;
          }
        }
        const fullRows = [];
        for (let row = 0; row < ROWS; row += 1) {
          if (nextBoard[row].every((cell) => cell)) fullRows.push(row);
        }
        const cleared = fullRows.length;
        const afterBoard = nextBoard.map((row) => row.slice());
        clearLines(afterBoard);
        const lines = current.lines + cleared;
        const level = 1 + Math.floor(lines / 10);
        const score = current.score + SCORE_TABLE[cleared];
        const pieceId = (current.pieceId || 1) + 1;
        const piece = { type: current.next, x: Math.floor(COLS / 2) - 1, y: 0, rotation: 0 };
        const gameOver = collides(afterBoard, pieceCells(piece.type, piece.rotation, piece.x, piece.y));
        const after = {
          board: afterBoard,
          piece,
          next: randomPiece(),
          score,
          best: Math.max(current.best || 0, score),
          lines,
          level,
          gameOver,
          paused: current.paused,
          started: current.started,
          pieceId,
        };

        if (cleared > 0) {
          // Flash the cleared rows, then collapse. The resolved state is reported
          // immediately so a restart mid-flash restores a correct board.
          const visual = {
            ...current,
            board: nextBoard,
            piece: current.piece,
            flash: { rows: fullRows },
          };
          stateRef.current = visual;
          setState(visual);
          if (onChangeRef.current) onChangeRef.current(after);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => {
            flashTimer.current = null;
            stateRef.current = after;
            setState(after);
            if (onChangeRef.current) onChangeRef.current(after);
          }, 180);
          return;
        }
        commit(after);
      }, [commit]);

      const isStuck = (current) => current.gameOver || current.paused || Boolean(current.flash);

      const begin = useCallback(() => {
        const current = stateRef.current;
        if (current.started || current.gameOver) return;
        commit({ ...current, started: true });
      }, [commit]);

      useEffect(() => {
        if (active) return;
        const current = stateRef.current;
        if (current.started) commit({ ...current, started: false });
      }, [active, commit]);

      useEffect(() => {
        const id = setInterval(() => {
          const current = stateRef.current;
          if (!activeRef.current || !current.started || isStuck(current)) return;
          tick.current += 40;
          const speed = Math.max(80, 800 - (current.level - 1) * 60);
          if (tick.current < speed) return;
          tick.current = 0;
          const cells = pieceCells(current.piece.type, current.piece.rotation, current.piece.x, current.piece.y + 1);
          if (collides(current.board, cells)) {
            lock(current);
          } else {
            commit({ ...current, piece: { ...current.piece, y: current.piece.y + 1 } });
          }
        }, 40);
        return () => clearInterval(id);
      }, [commit, lock]);

      const move = useCallback((dx) => {
        const current = stateRef.current;
        if (isStuck(current)) return;
        const cells = pieceCells(current.piece.type, current.piece.rotation, current.piece.x + dx, current.piece.y);
        if (collides(current.board, cells)) return;
        commit({ ...current, piece: { ...current.piece, x: current.piece.x + dx } });
      }, [commit]);

      const rotate = useCallback(() => {
        const current = stateRef.current;
        if (isStuck(current)) return;
        const rotation = (current.piece.rotation + 1) % 4;
        for (const offset of [0, -1, 1, -2, 2]) {
          const cells = pieceCells(current.piece.type, rotation, current.piece.x + offset, current.piece.y);
          if (!collides(current.board, cells)) {
            commit({ ...current, piece: { ...current.piece, rotation, x: current.piece.x + offset } });
            return;
          }
        }
      }, [commit]);

      const softDrop = useCallback(() => {
        const current = stateRef.current;
        if (isStuck(current)) return;
        const cells = pieceCells(current.piece.type, current.piece.rotation, current.piece.x, current.piece.y + 1);
        if (collides(current.board, cells)) {
          lock(current);
        } else {
          const score = current.score + 1;
          commit({ ...current, piece: { ...current.piece, y: current.piece.y + 1 }, score, best: Math.max(current.best || 0, score) });
        }
      }, [commit, lock]);

      const hardDrop = useCallback(() => {
        const current = stateRef.current;
        if (isStuck(current)) return;
        let y = current.piece.y;
        while (!collides(current.board, pieceCells(current.piece.type, current.piece.rotation, current.piece.x, y + 1))) {
          y += 1;
        }
        lock({ ...current, piece: { ...current.piece, y } });
      }, [lock]);

      const togglePause = useCallback(() => {
        const current = stateRef.current;
        if (current.gameOver || current.flash) return;
        commit({ ...current, paused: !current.paused });
      }, [commit]);

      const restart = useCallback(() => {
        if (flashTimer.current) {
          clearTimeout(flashTimer.current);
          flashTimer.current = null;
        }
        tick.current = 0;
        commit(freshTetrisState());
      }, [commit]);

      useEffect(() => {
        if (!focused || !active) return undefined;
        const onKeyDown = (event) => {
          if (isTypingTarget(event.target)) return;
          const key = event.key;
          if (!stateRef.current.started) {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'x', 'X', 'p', 'P'].includes(key)) {
              event.preventDefault();
              begin();
            }
            return;
          }
          if (key === 'ArrowLeft') { event.preventDefault(); move(-1); return; }
          if (key === 'ArrowRight') { event.preventDefault(); move(1); return; }
          if (key === 'ArrowDown') { event.preventDefault(); softDrop(); return; }
          if (key === 'ArrowUp' || key === 'x' || key === 'X') { event.preventDefault(); rotate(); return; }
          if (key === ' ' || key === 'Spacebar') { event.preventDefault(); hardDrop(); return; }
          if (key === 'p' || key === 'P') { event.preventDefault(); togglePause(); return; }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [focused, active, begin, move, softDrop, rotate, hardDrop, togglePause]);

      const onTouchStart = useCallback((event) => {
        const point = event.touches[0];
        if (point) touch.current = { x: point.clientX, y: point.clientY };
      }, []);

      const onTouchEnd = useCallback((event) => {
        const start = touch.current;
        touch.current = null;
        const point = event.changedTouches[0];
        if (!start || !point) return;
        const dx = point.clientX - start.x;
        const dy = point.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
        else if (dy > 0) softDrop();
        else rotate();
      }, [move, softDrop, rotate]);

      const boardCells = [];
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          boardCells.push(renderBoardCell(state.board, row, col));
        }
      }

      // The active piece lives in its own layer so `transform` transitions can
      // animate movement, soft drop, wall kicks and hard drops.
      const pieceBlocks = [];
      if (!state.flash) {
        const shape = getShape(state.piece.type, state.piece.rotation);
        const offsets = [];
        for (let row = 0; row < shape.length; row += 1) {
          for (let col = 0; col < shape[row].length; col += 1) {
            if (shape[row][col]) offsets.push({ r: row, c: col });
          }
        }
        offsets.forEach((offset, index) => {
          const row = state.piece.y + offset.r;
          const col = state.piece.x + offset.c;
          pieceBlocks.push(h('div', {
            key: `pb-${state.pieceId}-${index}`,
            className: 'dshg-fade',
            style: {
              position: 'absolute',
              left: 0,
              top: 0,
              width: CELL_T,
              height: CELL_T,
              borderRadius: 3,
              background: TETROMINOES[state.piece.type].color,
              boxSizing: 'border-box',
              border: '1px solid rgba(255,255,255,0.28)',
              transform: `translate(${col * STRIDE_T}px, ${row * STRIDE_T}px)`,
              transition: 'transform 90ms cubic-bezier(.2,.8,.3,1)',
              willChange: 'transform',
            },
          }));
        });
      }

      const flashRows = state.flash
        ? h('div', { key: 'flash', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
            state.flash.rows.map((row) => h('div', {
              key: `fr-${row}`,
              className: 'dshg-flash',
              style: {
                position: 'absolute',
                left: 0,
                top: row * STRIDE_T,
                width: '100%',
                height: CELL_T,
                background: '#ffffff',
              },
            })))
        : null;

      return h('div', {
        style: { position: 'relative', height: '100%' },
        onPointerDown: () => {
          if (active) begin();
        },
        onTouchStart,
        onTouchEnd,
      }, [
        h('style', { key: 'css' }, TILE_CSS),
        h('div', {
          key: 'layout',
          style: { display: 'flex', alignItems: 'center', gap: 6, height: '100%' },
        }, [
          h('div', {
            key: 'side',
            style: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 6,
              width: 74,
              flex: '0 0 74px',
              height: BOARD_H_T + 2,
            },
          }, [
            sideChips([
              { label: '最高', value: state.best || 0 },
              { label: '分数', value: state.score },
              { label: '消行', value: state.lines },
              { label: '等级', value: state.level },
            ]),
            h('div', {
              key: 'hints',
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                fontSize: 9,
                lineHeight: 1.45,
                color: 'var(--dsw-alias-label-secondary)',
              },
            }, ['←→ 移动', '↑/X 转向', '↓ 加速', 'Space 硬落', 'P 暂停'].map((line) =>
              h('span', { key: line }, line))),
            h('div', {
              key: 'next',
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 4,
                fontSize: 9,
                color: 'var(--dsw-alias-label-secondary)',
              },
            }, [
              h('span', { key: 'l' }, '下一块'),
              renderMiniPiece(state.next, state.pieceId),
            ]),
          ]),
          h('div', { key: 'board', style: tetrisBoardStyle }, [
            h('div', { key: 'grid', style: tetrisGridStyle }, boardCells),
            h('div', { key: 'piece', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, pieceBlocks),
            flashRows,
            !state.started && !state.gameOver && !state.flash
              ? h('button', {
                  key: 'start',
                  type: 'button',
                  onClick: begin,
                  style: {
                    ...overlayStyle('rgba(11, 16, 22, 0.78)', '#ffffff'),
                    border: 'none',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontWeight: 800,
                  },
                }, '点击开始')
              : null,
            state.paused && state.started && !state.gameOver && !state.flash
              ? h('div', { key: 'pause', style: overlayStyle('rgba(11, 16, 22, 0.85)', '#ffffff') }, '暂停中 (P)')
              : null,
            state.gameOver && !state.flash
              ? h('div', { key: 'over', style: overlayStyle('rgba(11, 16, 22, 0.92)', '#ffffff') }, [
                  h('div', { key: 'text', style: { marginBottom: 8, color: '#fff' } }, '游戏结束'),
                  h('button', {
                    key: 'again',
                    type: 'button',
                    style: againButtonStyle,
                    onClick: restart,
                  }, '再来一局'),
                ])
              : null,
          ]),
        ]),
      ]);
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Gomoku (五子棋)                                              │
    // └──────────────────────────────────────────────────────────────┘
    const GOMOKU_N = 15;
    const GO_SPACING = 14;
    const GO_PAD = 10;
    const GOMOKU_BOARD = (GOMOKU_N - 1) * GO_SPACING + GO_PAD * 2;

    function freshGomokuState() {
      return {
        board: Array.from({ length: GOMOKU_N }, () => Array(GOMOKU_N).fill(0)),
        turn: 1,
        winner: 0,
        moves: 0,
        level: 'normal',
      };
    }

    function sanitizeGomoku(state) {
      if (!state || !Array.isArray(state.board) || state.board.length !== GOMOKU_N) return null;
      const ok = state.board.every((row) =>
        Array.isArray(row) && row.length === GOMOKU_N &&
        row.every((cell) => cell === 0 || cell === 1 || cell === 2 || cell === null),
      );
      if (!ok) return null;
      return {
        board: state.board.map((row) => row.map((cell) => (cell ? cell : 0))),
        turn: state.turn === 2 ? 2 : 1,
        winner: state.winner === 1 || state.winner === 2 ? state.winner : 0,
        moves: Number(state.moves) || 0,
        level: state.level === 'easy' || state.level === 'hard' ? state.level : 'normal',
      };
    }

    function gomokuWinAt(board, row, col, player) {
      const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (const [dr, dc] of directions) {
        let count = 1;
        for (const sign of [1, -1]) {
          let r = row + dr * sign;
          let c = col + dc * sign;
          while (r >= 0 && r < GOMOKU_N && c >= 0 && c < GOMOKU_N && board[r][c] === player) {
            count += 1;
            r += dr * sign;
            c += dc * sign;
          }
        }
        if (count >= 5) return true;
      }
      return false;
    }

    function placeStone(state, row, col) {
      if (state.winner || row < 0 || row >= GOMOKU_N || col < 0 || col >= GOMOKU_N) return state;
      if (state.board[row][col]) return state;
      const board = state.board.map((line) => line.slice());
      board[row][col] = state.turn;
      const winner = gomokuWinAt(board, row, col, state.turn) ? state.turn : 0;
      return {
        board,
        turn: state.turn === 1 ? 2 : 1,
        winner,
        moves: state.moves + 1,
      };
    }

    function gomokuLineScore(board, row, col, player, dr, dc) {
      let count = 1;
      let openEnds = 0;
      for (const sign of [1, -1]) {
        let r = row + dr * sign;
        let c = col + dc * sign;
        while (r >= 0 && r < GOMOKU_N && c >= 0 && c < GOMOKU_N && board[r][c] === player) {
          count += 1;
          r += dr * sign;
          c += dc * sign;
        }
        if (r >= 0 && r < GOMOKU_N && c >= 0 && c < GOMOKU_N && board[r][c] === 0) openEnds += 1;
      }
      return { count, openEnds };
    }

    function gomokuPointScore(board, row, col, player) {
      let score = 0;
      for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const { count, openEnds } = gomokuLineScore(board, row, col, player, dr, dc);
        if (count >= 5) score += 100000;
        else if (count === 4) score += openEnds > 0 ? 12000 : 1500;
        else if (count === 3) score += openEnds === 2 ? 1200 : openEnds === 1 ? 150 : 15;
        else if (count === 2) score += openEnds === 2 ? 120 : openEnds === 1 ? 15 : 2;
        else score += openEnds > 0 ? 1 : 0;
      }
      return score;
    }

    function gomokuWouldWin(board, row, col, player) {
      if (board[row][col]) return false;
      board[row][col] = player;
      const won = gomokuWinAt(board, row, col, player);
      board[row][col] = 0;
      return won;
    }

    function gomokuAiMove(board, aiPlayer, humanPlayer, level) {
      const difficulty = level === 'easy' || level === 'hard' ? level : 'normal';
      const empties = [];
      for (let row = 0; row < GOMOKU_N; row += 1) {
        for (let col = 0; col < GOMOKU_N; col += 1) {
          if (!board[row][col]) empties.push({ row, col });
        }
      }
      if (!empties.length) return null;
      const pick = (list) => list[Math.floor(Math.random() * list.length)];

      // Easy is a pure beginner: random empty cell, deliberately avoiding the
      // area around your stones so it never blocks or builds threats on purpose.
      if (difficulty === 'easy') {
        const humanStones = [];
        for (let row = 0; row < GOMOKU_N; row += 1) {
          for (let col = 0; col < GOMOKU_N; col += 1) {
            if (board[row][col] === humanPlayer) humanStones.push({ row, col });
          }
        }
        const calm = empties.filter((cell) => !humanStones.some((stone) =>
          Math.abs(stone.row - cell.row) <= 1 && Math.abs(stone.col - cell.col) <= 1));
        return pick(calm.length ? calm : empties);
      }

      // Normal / hard: always take a win, then block yours.
      for (const cell of empties) if (gomokuWouldWin(board, cell.row, cell.col, aiPlayer)) return cell;
      for (const cell of empties) if (gomokuWouldWin(board, cell.row, cell.col, humanPlayer)) return cell;

      const attackWeight = difficulty === 'hard' ? 1.5 : 1.15;
      const defendWeight = difficulty === 'hard' ? 1.1 : 1;
      let best = -Infinity;
      let bestMoves = [];
      for (const cell of empties) {
        const attack = gomokuPointScore(board, cell.row, cell.col, aiPlayer);
        const defend = gomokuPointScore(board, cell.row, cell.col, humanPlayer);
        let score = attack * attackWeight + defend * defendWeight;
        score += (7 - Math.abs(cell.row - 7)) + (7 - Math.abs(cell.col - 7));
        if (difficulty === 'hard') {
          // prefer moves that create two open threats
          board[cell.row][cell.col] = aiPlayer;
          let openThrees = 0;
          for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
            const { count, openEnds } = gomokuLineScore(board, cell.row, cell.col, aiPlayer, dr, dc);
            if (count >= 3 && openEnds > 0) openThrees += 1;
          }
          board[cell.row][cell.col] = 0;
          score += openThrees * 450;
        }
        if (score > best + 0.001) {
          best = score;
          bestMoves = [cell];
        } else if (Math.abs(score - best) <= 0.001) {
          bestMoves.push(cell);
        }
      }
      return bestMoves.length ? pick(bestMoves) : null;
    }

    const gomokuBoardStyle = {
      position: 'relative',
      flexShrink: 0,
      width: GOMOKU_BOARD,
      height: GOMOKU_BOARD,
      background: '#dcb47c',
      borderRadius: 4,
      border: '1px solid #8a6a3a',
      touchAction: 'manipulation',
      boxSizing: 'border-box',
    };

    const goLineStyle = {
      position: 'absolute',
      left: GO_PAD,
      top: GO_PAD,
      width: (GOMOKU_N - 1) * GO_SPACING,
      height: (GOMOKU_N - 1) * GO_SPACING,
      backgroundImage: [
        `repeating-linear-gradient(to right, rgba(70,48,24,0.7) 0 1px, transparent 1px ${GO_SPACING}px)`,
        `repeating-linear-gradient(to bottom, rgba(70,48,24,0.7) 0 1px, transparent 1px ${GO_SPACING}px)`,
      ].join(','),
      borderRight: '1px solid rgba(70,48,24,0.7)',
      borderBottom: '1px solid rgba(70,48,24,0.7)',
      boxSizing: 'border-box',
      pointerEvents: 'none',
    };

    const GO_STARS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];

    function GameGomoku({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeGomoku(initial) || freshGomokuState());
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const aiTimer = useRef(null);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      useEffect(() => () => {
        if (aiTimer.current) clearTimeout(aiTimer.current);
      }, []);

      // single player: you are black (1), the computer answers as white (2)
      useEffect(() => {
        if (!active || state.winner || state.turn !== 2) return undefined;
        aiTimer.current = setTimeout(() => {
          const current = stateRef.current;
          if (current.winner || current.turn !== 2) return;
          const move = gomokuAiMove(current.board, 2, 1, current.level);
          if (!move) return;
          const next = placeStone(current, move.row, move.col);
          if (next === current) return;
          stateRef.current = next;
          setState(next);
          if (onChangeRef.current) onChangeRef.current(next);
        }, 280);
        return () => {
          if (aiTimer.current) {
            clearTimeout(aiTimer.current);
            aiTimer.current = null;
          }
        };
      }, [active, state.turn, state.winner]);

      const setLevel = useCallback((level) => {
        const current = stateRef.current;
        if (current.level === level) return;
        const next = { ...current, level };
        stateRef.current = next;
        setState(next);
        if (onChangeRef.current) onChangeRef.current(next);
      }, []);

      const play = useCallback((row, col) => {
        const current = stateRef.current;
        const next = placeStone(current, row, col);
        if (next === current) return;
        stateRef.current = next;
        setState(next);
        if (onChangeRef.current) onChangeRef.current(next);
      }, []);

      const stones = [];
      for (let row = 0; row < GOMOKU_N; row += 1) {
        for (let col = 0; col < GOMOKU_N; col += 1) {
          const value = state.board[row][col];
          stones.push(h('button', {
            key: `${row}-${col}`,
            type: 'button',
            onPointerDown: () => {
              if (active && !state.winner && state.turn === 1) play(row, col);
            },
            style: {
              position: 'absolute',
              left: GO_PAD + col * GO_SPACING,
              top: GO_PAD + row * GO_SPACING,
              width: 18,
              height: 18,
              marginLeft: -9,
              marginTop: -9,
              padding: 0,
              border: 'none',
              borderRadius: '50%',
              background: 'transparent',
              cursor: state.winner ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          }, value ? h('svg', {
            width: 13,
            height: 13,
            viewBox: '0 0 13 13',
            style: { display: 'block', flex: '0 0 13px', filter: 'drop-shadow(0 0.5px 1px rgba(0,0,0,0.45))' },
          }, [
            h('defs', { key: 'defs' }, h('radialGradient', {
              key: 'grad',
              id: value === 1 ? 'dshgomoku-black' : 'dshgomoku-white',
              cx: '33%',
              cy: '28%',
              r: '70%',
            }, value === 1
              ? [
                  h('stop', { key: 's0', offset: '0%', stopColor: '#8d8d8d' }),
                  h('stop', { key: 's1', offset: '16%', stopColor: '#4a4a4a' }),
                  h('stop', { key: 's2', offset: '48%', stopColor: '#141414' }),
                  h('stop', { key: 's3', offset: '100%', stopColor: '#000000' }),
                ]
              : [
                  h('stop', { key: 's0', offset: '0%', stopColor: '#ffffff' }),
                  h('stop', { key: 's1', offset: '45%', stopColor: '#f2efe8' }),
                  h('stop', { key: 's2', offset: '100%', stopColor: '#d0cbc0' }),
                ])),
            h('circle', {
              key: 'circle',
              cx: 6.5,
              cy: 6.5,
              r: 6.5,
              fill: value === 1 ? 'url(#dshgomoku-black)' : 'url(#dshgomoku-white)',
              stroke: value === 1 ? '#000000' : '#b9b4a9',
              strokeWidth: 0.5,
            }),
          ]) : null));
        }
      }

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      }, [
        h('div', {
          key: 'chips',
          style: { display: 'flex', gap: 6, alignItems: 'stretch', marginBottom: 8, padding: '0 2px' },
        }, [
          h('div', { key: 'turn', style: { ...chipStyle, minWidth: 0, flex: '1 1 0', padding: '2px 4px' } }, [
            h('span', { key: 'l', style: chipLabelStyle }, '执子'),
            h('span', { key: 'v', style: { ...chipValueStyle, fontSize: 11 } },
              state.winner ? (state.winner === 1 ? '你赢' : '电脑赢') : (state.turn === 1 ? '你' : '电脑…')),
          ]),
          h('div', { key: 'moves', style: { ...chipStyle, minWidth: 0, flex: '1 1 0', padding: '2px 4px' } }, [
            h('span', { key: 'l', style: chipLabelStyle }, '步数'),
            h('span', { key: 'v', style: { ...chipValueStyle, fontSize: 11 } }, String(state.moves)),
          ]),
          h('div', { key: 'level', style: { ...chipStyle, minWidth: 0, flex: '0 0 64px', padding: '2px 4px' } }, [
            h('span', { key: 'l', style: chipLabelStyle }, '难度'),
            h('select', {
              key: 's',
              value: state.level || 'normal',
              onChange: (event) => {
                if (active) setLevel(event.target.value);
              },
              style: {
                font: 'inherit',
                fontSize: 10,
                border: 'none',
                background: 'transparent',
                color: 'var(--dsw-alias-label-primary)',
                padding: 0,
                maxWidth: 56,
              },
            }, [
              h('option', { key: 'easy', value: 'easy' }, '简单'),
              h('option', { key: 'normal', value: 'normal' }, '普通'),
              h('option', { key: 'hard', value: 'hard' }, '困难'),
            ]),
          ]),
        ]),
        h('div', {
          key: 'wrap',
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', {
          key: 'board',
          style: gomokuBoardStyle,
          title: '点击交叉点落子（你执黑）',
        }, [
          h('div', { key: 'lines', style: goLineStyle }),
          ...GO_STARS.map(([row, col]) => h('div', {
            key: `star-${row}-${col}`,
            style: {
              position: 'absolute',
              left: GO_PAD + col * GO_SPACING - 2,
              top: GO_PAD + row * GO_SPACING - 2,
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'rgba(70,48,24,0.85)',
              pointerEvents: 'none',
            },
          })),
          ...stones,
        ])),
      ]);
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Klotski (华容道)                                             │
    // └──────────────────────────────────────────────────────────────┘
    const K_COLS = 4;
    const K_ROWS = 5;
    const K_CELL = 45;
    const K_GAP = 2;
    const K_BOARD_W = K_COLS * K_CELL + (K_COLS - 1) * K_GAP;
    const K_BOARD_H = K_ROWS * K_CELL + (K_ROWS - 1) * K_GAP;

    const KLOTSKI_LAYOUT = [
      { id: 'cao', name: '曹操', x: 1, y: 0, w: 2, h: 2, tone: '#c0392b' },
      { id: 'zhang', name: '张', x: 0, y: 0, w: 1, h: 2, tone: '#2c7a4b' },
      { id: 'zhao', name: '赵', x: 3, y: 0, w: 1, h: 2, tone: '#2c5aa0' },
      { id: 'ma', name: '马', x: 0, y: 2, w: 1, h: 2, tone: '#7d5a2a' },
      { id: 'huang', name: '黄', x: 3, y: 2, w: 1, h: 2, tone: '#7a4b8c' },
      { id: 'guan', name: '关羽', x: 1, y: 2, w: 2, h: 1, tone: '#a04040' },
      { id: 's1', name: '卒', x: 1, y: 3, w: 1, h: 1, tone: '#4b6b6b' },
      { id: 's2', name: '卒', x: 2, y: 3, w: 1, h: 1, tone: '#4b6b6b' },
      { id: 's3', name: '卒', x: 0, y: 4, w: 1, h: 1, tone: '#4b6b6b' },
      { id: 's4', name: '卒', x: 3, y: 4, w: 1, h: 1, tone: '#4b6b6b' },
    ];

    function freshKlotskiState() {
      return {
        pieces: KLOTSKI_LAYOUT.map((piece) => ({ ...piece })),
        selected: null,
        moves: 0,
        solved: false,
      };
    }

    function sanitizeKlotski(state) {
      if (!state || !Array.isArray(state.pieces) || state.pieces.length !== KLOTSKI_LAYOUT.length) return null;
      const pieces = [];
      for (const template of KLOTSKI_LAYOUT) {
        const found = state.pieces.find((piece) => piece && piece.id === template.id);
        if (!found) return null;
        const x = Number(found.x);
        const y = Number(found.y);
        if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
        if (x < 0 || y < 0 || x + template.w > K_COLS || y + template.h > K_ROWS) return null;
        pieces.push({ ...template, x, y });
      }
      const cao = pieces.find((piece) => piece.id === 'cao');
      return {
        pieces,
        selected: state.selected || null,
        moves: Number(state.moves) || 0,
        solved: cao.x === 1 && cao.y === 3,
      };
    }

    function pieceCellsAt(piece, x, y) {
      const cells = [];
      for (let row = 0; row < piece.h; row += 1) {
        for (let col = 0; col < piece.w; col += 1) cells.push({ r: y + row, c: x + col });
      }
      return cells;
    }

    function klotskiCanMove(pieces, pieceId, dx, dy) {
      const piece = pieces.find((item) => item.id === pieceId);
      if (!piece) return false;
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (x < 0 || y < 0 || x + piece.w > K_COLS || y + piece.h > K_ROWS) return false;
      const target = pieceCellsAt(piece, x, y);
      for (const other of pieces) {
        if (other.id === pieceId) continue;
        const occupied = pieceCellsAt(other, other.x, other.y);
        for (const cell of target) {
          if (occupied.some((spot) => spot.r === cell.r && spot.c === cell.c)) return false;
        }
      }
      return true;
    }

    function klotskiMove(state, dx, dy) {
      if (!state.selected) return state;
      if (!klotskiCanMove(state.pieces, state.selected, dx, dy)) return state;
      const pieces = state.pieces.map((piece) =>
        piece.id === state.selected ? { ...piece, x: piece.x + dx, y: piece.y + dy } : piece);
      const cao = pieces.find((piece) => piece.id === 'cao');
      return {
        pieces,
        selected: state.selected,
        moves: state.moves + 1,
        solved: cao.x === 1 && cao.y === 3,
      };
    }

    const klotskiBoardStyle = {
      position: 'relative',
      width: K_BOARD_W,
      height: K_BOARD_H,
      background: '#8f7a66',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-l1)',
      touchAction: 'manipulation',
    };

    function GameKlotski({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeKlotski(initial) || freshKlotskiState());
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      const commit = useCallback((next) => {
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
        if (onChangeRef.current) onChangeRef.current(next);
      }, []);

      const select = useCallback((id) => {
        commit({ ...stateRef.current, selected: id });
      }, [commit]);

      const move = useCallback((dx, dy) => {
        if (!active) return;
        commit(klotskiMove(stateRef.current, dx, dy));
      }, [active, commit]);

      useEffect(() => {
        if (!focused || !active) return undefined;
        const onKeyDown = (event) => {
          if (isTypingTarget(event.target)) return;
          const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const step = keys[event.key];
          if (!step) return;
          event.preventDefault();
          move(step[0], step[1]);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [focused, active, move]);

      const clickBoard = useCallback((event) => {
        if (!active) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const col = Math.floor((event.clientX - rect.left) / (K_CELL + K_GAP));
        const row = Math.floor((event.clientY - rect.top) / (K_CELL + K_GAP));
        const current = stateRef.current;
        if (!current.selected) return;
        for (const step of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const piece = current.pieces.find((item) => item.id === current.selected);
          if (!piece) return;
          const x = piece.x + step[0];
          const y = piece.y + step[1];
          const target = pieceCellsAt(piece, x, y);
          if (target.some((cell) => cell.r === row && cell.c === col) && klotskiCanMove(current.pieces, current.selected, step[0], step[1])) {
            commit(klotskiMove(current, step[0], step[1]));
            return;
          }
        }
      }, [active, commit]);

      const blocks = state.pieces.map((piece) => h('button', {
        key: piece.id,
        type: 'button',
        onPointerDown: (event) => {
          event.stopPropagation();
          if (!active) return;
          select(piece.id);
        },
        style: {
          position: 'absolute',
          left: piece.x * (K_CELL + K_GAP),
          top: piece.y * (K_CELL + K_GAP),
          width: piece.w * K_CELL + (piece.w - 1) * K_GAP,
          height: piece.h * K_CELL + (piece.h - 1) * K_GAP,
          background: piece.tone,
          color: '#fff',
          border: state.selected === piece.id ? '2px solid #ffd166' : '1px solid rgba(0,0,0,0.25)',
          borderRadius: 5,
          fontSize: piece.w > 1 && piece.h > 1 ? 13 : 11,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          boxSizing: 'border-box',
          transition: 'left 90ms ease-out, top 90ms ease-out, border-color 90ms ease-out',
        },
      }, piece.name));

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      }, [
        h('div', { key: 'chips' }, chips([
          { label: '步数', value: state.moves },
          { label: '状态', value: state.solved ? '通关' : '进行中' },
        ])),
        h('div', {
          key: 'wrap',
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', {
          key: 'board',
          style: klotskiBoardStyle,
          title: '先点棋子，再点目标格或按方向键',
          onPointerDown: clickBoard,
        }, [
          ...blocks,
          state.solved
            ? h('div', { key: 'done', style: overlayStyle('rgba(143, 122, 102, 0.9)', '#ffffff') }, [
                h('div', { key: 'text', style: { marginBottom: 8 } }, '通关！'),
              ])
            : null,
        ])),
      ]);
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Snake (贪吃蛇)                                               │
    // └──────────────────────────────────────────────────────────────┘
    const SNAKE_N = 15;
    const S_CELL = 13;
    const S_GAP = 1;
    const SNAKE_BOARD = SNAKE_N * S_CELL + (SNAKE_N - 1) * S_GAP;

    function snakeFood(snake) {
      const occupied = new Set(snake.map((segment) => segment.r * SNAKE_N + segment.c));
      const empty = [];
      for (let row = 0; row < SNAKE_N; row += 1) {
        for (let col = 0; col < SNAKE_N; col += 1) {
          if (!occupied.has(row * SNAKE_N + col)) empty.push({ r: row, c: col });
        }
      }
      if (!empty.length) return null;
      return empty[Math.floor(Math.random() * empty.length)];
    }

    function freshSnakeState() {
      const snake = [{ r: 7, c: 6 }, { r: 7, c: 5 }, { r: 7, c: 4 }];
      return {
        snake,
        dir: { r: 0, c: 1 },
        food: snakeFood(snake),
        score: 0,
        best: 0,
        alive: true,
        paused: false,
      };
    }

    function sanitizeSnake(state) {
      if (!state || !Array.isArray(state.snake) || !state.snake.length) return null;
      const snake = state.snake
        .filter((segment) => segment && Number.isInteger(segment.r) && Number.isInteger(segment.c))
        .map((segment) => ({ r: segment.r, c: segment.c }));
      if (!snake.length) return null;
      const dir = state.dir && Number.isInteger(state.dir.r) && Number.isInteger(state.dir.c)
        ? { r: state.dir.r, c: state.dir.c }
        : { r: 0, c: 1 };
      return {
        snake,
        dir,
        food: state.food && Number.isInteger(state.food.r) ? { r: state.food.r, c: state.food.c } : snakeFood(snake),
        score: Number(state.score) || 0,
        best: Math.max(Number(state.best) || 0, Number(state.score) || 0),
        alive: state.alive !== false,
        paused: Boolean(state.paused),
      };
    }

    function snakeStep(state) {
      if (!state.alive || state.paused) return state;
      const head = state.snake[0];
      const next = { r: head.r + state.dir.r, c: head.c + state.dir.c };
      if (next.r < 0 || next.r >= SNAKE_N || next.c < 0 || next.c >= SNAKE_N) {
        return { ...state, alive: false };
      }
      const eating = state.food && next.r === state.food.r && next.c === state.food.c;
      const body = eating ? state.snake : state.snake.slice(0, -1);
      if (body.some((segment) => segment.r === next.r && segment.c === next.c)) {
        return { ...state, alive: false };
      }
      const snake = [next, ...body];
      const score = eating ? state.score + 10 : state.score;
      return {
        ...state,
        snake,
        score,
        best: Math.max(state.best || 0, score),
        food: eating ? snakeFood(snake) : state.food,
      };
    }

    const snakeBoardStyle = {
      position: 'relative',
      width: SNAKE_BOARD,
      height: SNAKE_BOARD,
      display: 'grid',
      gridTemplateColumns: `repeat(${SNAKE_N}, ${S_CELL}px)`,
      gridTemplateRows: `repeat(${SNAKE_N}, ${S_CELL}px)`,
      gap: S_GAP,
      background: '#0b1016',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-l1)',
      touchAction: 'none',
    };

    function GameSnake({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeSnake(initial) || freshSnakeState());
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const activeRef = useRef(active);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        activeRef.current = active;
      }, [active]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      const commit = useCallback((next) => {
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
        if (onChangeRef.current) onChangeRef.current(next);
      }, []);

      useEffect(() => {
        const id = setInterval(() => {
          if (!activeRef.current) return;
          const current = stateRef.current;
          if (!current.alive || current.paused) return;
          commit(snakeStep(current));
        }, 140);
        return () => clearInterval(id);
      }, [commit]);

      const turn = useCallback((dr, dc) => {
        const current = stateRef.current;
        if (!current.alive || current.paused) return;
        if (current.dir.r === -dr && current.dir.c === -dc) return;
        commit({ ...current, dir: { r: dr, c: dc } });
      }, [commit]);

      const togglePause = useCallback(() => {
        const current = stateRef.current;
        if (!current.alive) return;
        commit({ ...current, paused: !current.paused });
      }, [commit]);

      const restart = useCallback(() => {
        const current = stateRef.current;
        commit({ ...freshSnakeState(), best: Math.max(current.best || 0, current.score || 0) });
      }, [commit]);

      useEffect(() => {
        if (!focused || !active) return undefined;
        const onKeyDown = (event) => {
          if (isTypingTarget(event.target)) return;
          const key = event.key;
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') { event.preventDefault(); turn(0, -1); return; }
          if (key === 'ArrowRight' || key === 'd' || key === 'D') { event.preventDefault(); turn(0, 1); return; }
          if (key === 'ArrowUp' || key === 'w' || key === 'W') { event.preventDefault(); turn(-1, 0); return; }
          if (key === 'ArrowDown' || key === 's' || key === 'S') { event.preventDefault(); turn(1, 0); return; }
          if (key === 'p' || key === 'P') { event.preventDefault(); togglePause(); return; }
          if (key === ' ') { event.preventDefault(); restart(); return; }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [focused, active, turn, togglePause, restart]);

      const occupied = new Map();
      for (let index = 0; index < state.snake.length; index += 1) {
        const segment = state.snake[index];
        occupied.set(segment.r * SNAKE_N + segment.c, index);
      }

      const cells = [];
      for (let row = 0; row < SNAKE_N; row += 1) {
        for (let col = 0; col < SNAKE_N; col += 1) {
          const key = row * SNAKE_N + col;
          const segment = occupied.get(key);
          const isFood = state.food && state.food.r === row && state.food.c === col;
          cells.push(h('div', {
            key,
            style: {
              width: S_CELL,
              height: S_CELL,
              borderRadius: 2,
              background: segment !== undefined
                ? (segment === 0 ? '#4cd964' : '#2f9e44')
                : (isFood ? '#ff6b6b' : '#141a22'),
              transition: 'background-color 100ms ease-out',
            },
          }));
        }
      }

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      }, [
        h('div', { key: 'chips' }, chips([
          { label: '分数', value: state.score },
          { label: '最高', value: state.best },
        ])),
        h('div', {
          key: 'wrap',
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', { key: 'board', style: snakeBoardStyle, title: '方向键/WASD 控制，P 暂停，空格重开' }, [
          ...cells,
          !state.alive
            ? h('div', { key: 'over', style: overlayStyle('rgba(11, 16, 22, 0.9)', '#ffffff') }, [
                h('div', { key: 'text', style: { marginBottom: 8 } }, '游戏结束'),
                h('button', {
                  key: 'again',
                  type: 'button',
                  style: againButtonStyle,
                  onClick: restart,
                }, '再来一局'),
              ])
            : null,
          state.paused && state.alive
            ? h('div', { key: 'pause', style: overlayStyle('rgba(11, 16, 22, 0.85)', '#ffffff') }, '暂停中 (P)')
            : null,
        ])),
      ]);
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Schulte table (舒尔特方格)                                   │
    // └──────────────────────────────────────────────────────────────┘
    const SCH_N = 5;
    const SCH_CELL = 40;
    const SCH_GAP = 4;
    const SCH_STRIDE = SCH_CELL + SCH_GAP;
    const SCH_BOARD = SCH_N * SCH_STRIDE - SCH_GAP;

    function schulteShuffle(cells) {
      const next = cells.slice();
      const indices = [];
      const values = [];
      for (let index = 0; index < next.length; index += 1) {
        if (next[index]) {
          indices.push(index);
          values.push(next[index]);
        }
      }
      for (let index = values.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        const temp = values[index];
        values[index] = values[swap];
        values[swap] = temp;
      }
      for (let index = 0; index < indices.length; index += 1) next[indices[index]] = values[index];
      return next;
    }

    function freshSchulteState(best, mode) {
      const cells = Array.from({ length: SCH_N * SCH_N }, (_, index) => index + 1);
      return {
        cells: schulteShuffle(cells),
        next: 1,
        errors: 0,
        best: Number(best) || 0,
        elapsed: 0,
        running: false,
        started: false,
        finished: false,
        wrong: 0,
        mode: mode === 'circle' ? 'circle' : 'grid',
      };
    }

    function sanitizeSchulte(state) {
      // A timed run is not meaningful across restarts; only the best time and board mode survive.
      const best = state && Number(state.best) ? Number(state.best) : 0;
      const mode = state && state.mode === 'circle' ? 'circle' : 'grid';
      return freshSchulteState(best, mode);
    }

    const SCH_CIRCLE_SIZE = 28;
    const SCH_CIRCLE_R1 = 56;
    const SCH_CIRCLE_R2 = 92;
    const SCH_CIRCLE_CENTER = SCH_BOARD / 2;

    function schulteSlot(index, mode, spin) {
      if (mode === 'circle') {
        if (index === 0) {
          return { x: SCH_CIRCLE_CENTER - SCH_CIRCLE_SIZE / 2, y: SCH_CIRCLE_CENTER - SCH_CIRCLE_SIZE / 2 };
        }
        const ring = index <= 8 ? 1 : 2;
        const radius = ring === 1 ? SCH_CIRCLE_R1 : SCH_CIRCLE_R2;
        const count = ring === 1 ? 8 : 16;
        const angle = (-90 + (index - (ring === 1 ? 1 : 9)) * (360 / count) + (Number(spin) || 0)) * (Math.PI / 180);
        return {
          x: SCH_CIRCLE_CENTER + radius * Math.cos(angle) - SCH_CIRCLE_SIZE / 2,
          y: SCH_CIRCLE_CENTER + radius * Math.sin(angle) - SCH_CIRCLE_SIZE / 2,
        };
      }
      const size = SCH_CELL;
      return {
        x: (index % SCH_N) * SCH_STRIDE,
        y: Math.floor(index / SCH_N) * SCH_STRIDE,
      };
    }

    function schulteTap(state, index) {
      if (state.finished) return state;
      const value = state.cells[index];
      if (!value) return state;
      if (value !== state.next) {
        return { ...state, errors: state.errors + 1, wrong: value };
      }
      const cells = state.cells.slice();
      cells[index] = 0;
      const next = state.next + 1;
      const finished = next > SCH_N * SCH_N;
      return {
        ...state,
        cells,
        next,
        finished,
        running: finished ? false : state.running,
        wrong: 0,
      };
    }

    const schulteBoardStyle = {
      position: 'relative',
      width: SCH_BOARD,
      height: SCH_BOARD,
      overflow: 'hidden',
      background: 'var(--dsw-alias-bg-layer-2)',
      borderRadius: 8,
      border: '1px solid var(--dsw-alias-border-l1)',
      touchAction: 'manipulation',
    };

    function GameSchulte({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeSchulte(initial) || freshSchulteState(0));
      const [spin, setSpin] = useState(0);
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const startRef = useRef(0);
      const wrongTimer = useRef(null);

      useEffect(() => {
        if (!active || state.mode !== 'circle') return undefined;
        const id = setInterval(() => {
          setSpin(((Date.now() % 26000) / 26000) * 360);
        }, 16);
        return () => clearInterval(id);
      }, [active, state.mode]);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      useEffect(() => () => {
        if (wrongTimer.current) clearTimeout(wrongTimer.current);
      }, []);

      const commit = useCallback((next, notify) => {
        stateRef.current = next;
        setState(next);
        if (notify && onChangeRef.current) onChangeRef.current(next);
      }, []);

      // ticking clock (local only; not every tick is persisted)
      useEffect(() => {
        if (!state.running || state.finished) return undefined;
        const id = setInterval(() => {
          if (!active) return;
          const current = stateRef.current;
          if (!current.running) return;
          const elapsed = Date.now() - startRef.current;
          const next = { ...current, elapsed };
          stateRef.current = next;
          setState(next);
        }, 100);
        return () => clearInterval(id);
      }, [state.running, state.finished, active]);

      // dynamic table: reshuffle the numbers not found yet every 4 seconds
      useEffect(() => {
        const id = setInterval(() => {
          const current = stateRef.current;
          if (!active || !current.running || current.finished) return;
          const next = { ...current, cells: schulteShuffle(current.cells) };
          stateRef.current = next;
          setState(next);
        }, 4000);
        return () => clearInterval(id);
      }, [active]);

      const tap = useCallback((index) => {
        if (!active) return;
        const current = stateRef.current;
        if (current.finished) return;
        const firstMove = !current.started;
        const startTime = firstMove ? Date.now() : startRef.current;
        const base = firstMove
          ? { ...current, started: true, running: true, elapsed: 0 }
          : current;
        if (firstMove) startRef.current = startTime;
        let next = schulteTap(base, index);
        if (next === base) return;
        if (next.wrong) {
          if (wrongTimer.current) clearTimeout(wrongTimer.current);
          wrongTimer.current = setTimeout(() => {
            const latest = stateRef.current;
            if (latest.wrong) commit({ ...latest, wrong: 0 }, false);
          }, 260);
        }
        if (next.finished) {
          const elapsed = Date.now() - startTime;
          next = {
            ...next,
            elapsed,
            best: next.best ? Math.min(next.best, elapsed) : elapsed,
          };
        }
        commit(next, true);
      }, [active, commit]);

      const restart = useCallback(() => {
        startRef.current = 0;
        const current = stateRef.current;
        commit(freshSchulteState(current.best, current.mode), true);
      }, [commit]);

      const mode = state.mode === 'circle' ? 'circle' : 'grid';
      const tileSize = mode === 'circle' ? SCH_CIRCLE_SIZE : SCH_CELL;
      const tiles = [];
      for (let index = 0; index < state.cells.length; index += 1) {
        const value = state.cells[index];
        if (!value) continue;
        const slot = schulteSlot(index, mode, mode === 'circle' ? spin : 0);
        const wrong = state.wrong === value;
        tiles.push(h('button', {
          key: value,
          type: 'button',
          onPointerDown: () => tap(index),
          style: {
            position: 'absolute',
            left: 0,
            top: 0,
            width: tileSize,
            height: tileSize,
            transform: `translate(${slot.x}px, ${slot.y}px)`,
            transition: mode === 'circle'
              ? 'background-color 120ms ease-out'
              : 'transform 220ms cubic-bezier(.2,.8,.3,1), background-color 120ms ease-out',
            willChange: 'transform',
            border: wrong
              ? '1px solid var(--dsw-alias-state-error-primary)'
              : '1px solid var(--dsw-alias-border-l1)',
            borderRadius: mode === 'circle' ? '50%' : 6,
            background: wrong
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-bg-overlay)',
            color: wrong ? '#ffffff' : 'var(--dsw-alias-label-primary)',
            fontSize: mode === 'circle' ? 12 : 17,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            boxSizing: 'border-box',
            userSelect: 'none',
          },
        }, h('span', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          },
        }, String(value))));
      }

      const seconds = (ms) => (ms / 1000).toFixed(1);

      const toggleMode = () => {
        const current = stateRef.current;
        commit({ ...current, mode: current.mode === 'circle' ? 'grid' : 'circle' }, true);
      };

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      }, [
        h('div', {
          key: 'info',
          style: { display: 'flex', gap: 4, alignItems: 'stretch', marginBottom: 8 },
        }, [
          ...[
            ['进度', `${Math.min(state.next - 1, 25)}/25`],
            ['用时', seconds(state.elapsed)],
            ['最佳', state.best ? seconds(state.best) : '—'],
          ].map(([label, value]) => h('div', {
            key: label,
            style: { ...chipStyle, flex: '1 1 0', minWidth: 0, padding: '2px 4px' },
          }, [
            h('span', { key: 'l', style: chipLabelStyle }, label),
            h('span', { key: 'v', style: { ...chipValueStyle, fontSize: 11 } }, value),
          ])),
          h('button', {
            key: 'mode',
            type: 'button',
            onClick: toggleMode,
            title: '切换方形 / 圆形旋转棋盘',
            style: {
              ...chipStyle,
              flex: '0 0 42px',
              minWidth: 0,
              padding: '2px 4px',
              border: '1px solid var(--dsw-alias-border-l1)',
              cursor: 'pointer',
              font: 'inherit',
            },
          }, [
            h('span', { key: 'l', style: chipLabelStyle }, '棋盘'),
            h('span', { key: 'v', style: { ...chipValueStyle, fontSize: 11 } }, mode === 'circle' ? '圆' : '方'),
          ]),
        ]),
        h('div', {
          key: 'wrap',
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', {
          key: 'board',
          style: {
            ...schulteBoardStyle,
            borderRadius: mode === 'circle' ? '50%' : 8,
          },
          title: '按 1→25 顺序点击；剩余数字每 4 秒重新洗牌',
        }, [
          mode === 'circle'
            ? h('div', { key: 'rings', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, [
                h('div', {
                  key: 'r1',
                  style: {
                    position: 'absolute',
                    left: SCH_CIRCLE_CENTER - SCH_CIRCLE_R1 - 4,
                    top: SCH_CIRCLE_CENTER - SCH_CIRCLE_R1 - 4,
                    width: (SCH_CIRCLE_R1 + 4) * 2,
                    height: (SCH_CIRCLE_R1 + 4) * 2,
                    borderRadius: '50%',
                    border: '1px dashed var(--dsw-alias-border-l1)',
                  },
                }),
                h('div', {
                  key: 'r2',
                  style: {
                    position: 'absolute',
                    left: SCH_CIRCLE_CENTER - SCH_CIRCLE_R2 - 4,
                    top: SCH_CIRCLE_CENTER - SCH_CIRCLE_R2 - 4,
                    width: (SCH_CIRCLE_R2 + 4) * 2,
                    height: (SCH_CIRCLE_R2 + 4) * 2,
                    borderRadius: '50%',
                    border: '1px dashed var(--dsw-alias-border-l1)',
                  },
                }),
              ])
            : null,
          ...tiles,
          state.finished
            ? h('div', { key: 'done', style: { ...overlayStyle('var(--dsw-alias-bg-overlay)', 'var(--dsw-alias-label-primary)'), borderRadius: mode === 'circle' ? '50%' : 8 } }, [
                h('div', { key: 'text', style: { fontSize: 12, marginBottom: 4 } }, `完成 ${seconds(state.elapsed)}s`),
                h('div', { key: 'best', style: { fontSize: 10, marginBottom: 8 } }, `最佳 ${seconds(state.best)}s`),
                h('button', {
                  key: 'again',
                  type: 'button',
                  style: againButtonStyle,
                  onClick: restart,
                }, '再来一局'),
              ])
            : null,
        ])),
      ]);
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Breakout (打砖块)                                            │
    // └──────────────────────────────────────────────────────────────┘
    const BK_W = 200;
    const BK_H = 220;
    const BK_COLS = 7;
    const BK_ROWS = 6;
    const BK_BRICK_W = 23;
    const BK_BRICK_H = 9;
    const BK_GAP = 3;
    const BK_TOP = 12;
    const BK_BRICK_LEFT = 10;
    const BK_STAGGER = (BK_BRICK_W + BK_GAP) / 2;
    const BK_PADDLE_W = 48;
    const BK_PADDLE_H = 8;
    const BK_PADDLE_Y = BK_H - 16;
    const BK_BALL_R = 4;
    const BK_ROW_TONES = ['#ff6b6b', '#ff9f43', '#ffd166', '#4cd964', '#4aa3ff', '#a06bff'];

    function breakoutBricks() {
      const bricks = [];
      for (let row = 0; row < BK_ROWS; row += 1) {
        // odd rows are offset by half a brick and carry one fewer brick
        const staggered = row % 2 === 1;
        const offset = staggered ? BK_STAGGER : 0;
        const count = staggered ? BK_COLS - 1 : BK_COLS;
        for (let col = 0; col < count; col += 1) {
          bricks.push({
            x: BK_BRICK_LEFT + offset + col * (BK_BRICK_W + BK_GAP),
            y: BK_TOP + row * (BK_BRICK_H + BK_GAP),
            w: BK_BRICK_W,
            h: BK_BRICK_H,
            row,
            alive: true,
          });
        }
      }
      return bricks;
    }

    function freshBreakoutState(best) {
      return {
        bricks: breakoutBricks(),
        paddle: (BK_W - BK_PADDLE_W) / 2,
        ball: { x: BK_W / 2, y: BK_H - 40, vx: 2.2, vy: -2.6 },
        score: 0,
        lives: 3,
        best: Number(best) || 0,
        started: false,
        paused: false,
        over: false,
        won: false,
      };
    }

    function sanitizeBreakout(state) {
      const best = state && Number(state.best) ? Number(state.best) : 0;
      return freshBreakoutState(best);
    }

    function breakoutBounceBall(state, prev) {
      const ball = state.ball;
      if (ball.x - BK_BALL_R < 0) { ball.x = BK_BALL_R; ball.vx = Math.abs(ball.vx); }
      if (ball.x + BK_BALL_R > BK_W) { ball.x = BK_W - BK_BALL_R; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - BK_BALL_R < 0) { ball.y = BK_BALL_R; ball.vy = Math.abs(ball.vy); }

      if (ball.vy > 0 && ball.y + BK_BALL_R >= BK_PADDLE_Y && prev.y + BK_BALL_R <= BK_PADDLE_Y + BK_PADDLE_H) {
        const center = state.paddle + BK_PADDLE_W / 2;
        if (ball.x >= state.paddle - BK_BALL_R && ball.x <= state.paddle + BK_PADDLE_W + BK_BALL_R) {
          ball.y = BK_PADDLE_Y - BK_BALL_R;
          ball.vy = -Math.abs(ball.vy);
          const offset = (ball.x - center) / (BK_PADDLE_W / 2);
          ball.vx = Math.max(-3.6, Math.min(3.6, offset * 3.2));
        }
      }

      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
        const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
        const dx = ball.x - nearestX;
        const dy = ball.y - nearestY;
        if (dx * dx + dy * dy > BK_BALL_R * BK_BALL_R) continue;
        brick.alive = false;
        state.score += 10;
        state.best = Math.max(state.best, state.score);
        if (Math.abs(dx) > Math.abs(dy)) ball.vx = -ball.vx;
        else ball.vy = -ball.vy;
        break;
      }
    }

    function breakoutStep(state) {
      if (!state.started || state.paused || state.over) return state;
      const next = {
        ...state,
        bricks: state.bricks.map((brick) => ({ ...brick })),
        ball: { ...state.ball },
      };
      const prev = { x: next.ball.x, y: next.ball.y };
      next.ball.x += next.ball.vx;
      next.ball.y += next.ball.vy;
      breakoutBounceBall(next, prev);

      if (next.ball.y - BK_BALL_R > BK_H) {
        next.lives -= 1;
        next.ball = { x: BK_W / 2, y: BK_H - 40, vx: 2.2, vy: -2.6 };
        next.started = false;
        if (next.lives <= 0) {
          next.lives = 0;
          next.over = true;
        }
      }

      if (!next.over && next.bricks.every((brick) => !brick.alive)) {
        next.over = true;
        next.won = true;
        next.best = Math.max(next.best, next.score);
      }
      return next;
    }

    const breakoutFieldStyle = {
      position: 'relative',
      flexShrink: 0,
      width: BK_W,
      height: BK_H,
      background: '#0b1016',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-l1)',
      overflow: 'hidden',
      touchAction: 'none',
      cursor: 'ew-resize',
    };

    function GameBreakout({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeBreakout(initial) || freshBreakoutState(0));
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const activeRef = useRef(active);
      const pressed = useRef({ left: false, right: false });
      const fieldRef = useRef(null);
      const drag = useRef({ id: null, moved: false, startX: 0 });

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        activeRef.current = active;
      }, [active]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      const commit = useCallback((next, notify) => {
        stateRef.current = next;
        setState(next);
        if (notify && onChangeRef.current) onChangeRef.current(next);
      }, []);

      useEffect(() => {
        const id = setInterval(() => {
          if (!activeRef.current) return;
          const current = stateRef.current;
          let paddle = current.paddle;
          if (pressed.current.left) paddle -= 8;
          if (pressed.current.right) paddle += 8;
          paddle = Math.max(0, Math.min(BK_W - BK_PADDLE_W, paddle));
          let next = paddle === current.paddle ? current : { ...current, paddle };
          if (next.started && !next.paused && !next.over) next = breakoutStep(next);
          if (next === current) return;
          const changed = next.score !== current.score
            || next.lives !== current.lives
            || next.over !== current.over;
          commit(next, changed);
        }, 16);
        return () => clearInterval(id);
      }, [commit]);

      const aimAt = useCallback((clientX) => {
        const field = fieldRef.current;
        if (!field) return;
        const rect = field.getBoundingClientRect();
        const paddle = Math.max(0, Math.min(BK_W - BK_PADDLE_W, clientX - rect.left - BK_PADDLE_W / 2));
        const current = stateRef.current;
        if (Math.abs(paddle - current.paddle) < 0.5) return;
        commit({ ...current, paddle }, false);
      }, [commit]);

      const launch = useCallback(() => {
        const current = stateRef.current;
        if (current.over) {
          commit(freshBreakoutState(current.best), true);
          return;
        }
        if (!current.started) commit({ ...current, started: true, paused: false }, true);
      }, [commit]);

      const endDrag = useCallback((event, launchOnTap) => {
        const field = fieldRef.current;
        if (field && drag.current.id !== null) {
          try { field.releasePointerCapture(drag.current.id); } catch (error) { /* already released */ }
        }
        const wasTap = launchOnTap && !drag.current.moved;
        drag.current = { id: null, moved: false, startX: 0 };
        if (wasTap) launch();
      }, [launch]);

      const togglePause = useCallback(() => {
        const current = stateRef.current;
        if (!current.started || current.over) return;
        commit({ ...current, paused: !current.paused }, true);
      }, [commit]);

      const restart = useCallback(() => {
        commit(freshBreakoutState(stateRef.current.best), true);
      }, [commit]);

      useEffect(() => {
        if (!focused || !active) return undefined;
        const clear = () => {
          pressed.current.left = false;
          pressed.current.right = false;
        };
        const onKeyDown = (event) => {
          if (isTypingTarget(event.target)) return;
          const key = event.key;
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
            event.preventDefault();
            pressed.current.left = true;
            return;
          }
          if (key === 'ArrowRight' || key === 'd' || key === 'D') {
            event.preventDefault();
            pressed.current.right = true;
            return;
          }
          if (key === ' ' || key === 'Spacebar') {
            event.preventDefault();
            launch();
            return;
          }
          if (key === 'p' || key === 'P') {
            event.preventDefault();
            togglePause();
          }
        };
        const onKeyUp = (event) => {
          const key = event.key;
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') pressed.current.left = false;
          if (key === 'ArrowRight' || key === 'd' || key === 'D') pressed.current.right = false;
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', clear);
        return () => {
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onKeyUp);
          window.removeEventListener('blur', clear);
        };
      }, [focused, active, launch, togglePause]);

      const bricks = state.bricks.map((brick, index) => brick.alive ? h('div', {
        key: `brick-${index}`,
        style: {
          position: 'absolute',
          left: brick.x,
          top: brick.y,
          width: brick.w,
          height: brick.h,
          borderRadius: 2,
          background: BK_ROW_TONES[brick.row % BK_ROW_TONES.length],
          opacity: 0.9,
        },
      }) : null);

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
      }, [
        h('div', { key: 'chips' }, chips([
          { label: '分数', value: state.score },
          { label: '生命', value: state.lives },
          { label: '最高', value: state.best },
        ])),
        h('div', {
          key: 'wrap',
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', {
          key: 'field',
          ref: fieldRef,
          style: breakoutFieldStyle,
          title: '拖动或 ←→ / A D 控制挡板，空格发球，P 暂停',
          onPointerDown: (event) => {
            if (!active) return;
            const field = event.currentTarget;
            drag.current = { id: event.pointerId, moved: false, startX: event.clientX };
            if (field.setPointerCapture) {
              try { field.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
            }
            aimAt(event.clientX);
          },
          onPointerMove: (event) => {
            if (!active || drag.current.id !== event.pointerId) return;
            if (Math.abs(event.clientX - drag.current.startX) > 3) drag.current.moved = true;
            aimAt(event.clientX);
          },
          onPointerUp: (event) => {
            if (drag.current.id !== event.pointerId) return;
            endDrag(event, true);
          },
          onPointerCancel: (event) => {
            if (drag.current.id !== event.pointerId) return;
            endDrag(event, false);
          },
        }, [
          ...bricks,
          h('div', {
            key: 'paddle',
            style: {
              position: 'absolute',
              left: Math.round(state.paddle),
              top: BK_PADDLE_Y,
              width: BK_PADDLE_W,
              height: BK_PADDLE_H,
              borderRadius: 4,
              background: '#4aa3ff',
              boxShadow: '0 0 8px rgba(74, 163, 255, 0.85)',
              zIndex: 2,
            },
          }),
          h('div', {
            key: 'ball',
            style: {
              position: 'absolute',
              left: state.ball.x - BK_BALL_R,
              top: state.ball.y - BK_BALL_R,
              width: BK_BALL_R * 2,
              height: BK_BALL_R * 2,
              borderRadius: '50%',
              background: '#f9f6f2',
              boxShadow: '0 0 6px rgba(255,255,255,0.6)',
              zIndex: 2,
            },
          }),
          !state.started && !state.over
            ? h('div', {
                key: 'ready',
                style: {
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                  pointerEvents: 'none',
                  zIndex: 1,
                },
              }, '点击发球')
            : null,
          state.paused && state.started && !state.over
            ? h('div', { key: 'pause', style: overlayStyle('rgba(11, 16, 22, 0.7)', '#ffffff') }, '暂停中 (P)')
            : null,
          state.over
            ? h('div', { key: 'over', style: overlayStyle('rgba(11, 16, 22, 0.88)', '#ffffff') }, [
                h('div', { key: 'text', style: { marginBottom: 8 } }, state.won ? '通关！' : '游戏结束'),
                h('button', {
                  key: 'again',
                  type: 'button',
                  style: againButtonStyle,
                  onClick: restart,
                }, '再来一局'),
              ])
            : null,
        ])),
        h('div', {
          key: 'hint',
          style: {
            marginTop: 2,
            fontSize: 9,
            textAlign: 'center',
            color: 'var(--dsw-alias-label-secondary)',
            whiteSpace: 'nowrap',
          },
        }, active ? '拖动 / ←→ 控制挡板 · 空格发球 · P 暂停' : '点击卡片后拖动或方向键控制'),
      ]);
    }

    // ┌──────────────────────────────────────────────────────────────┐
    // │ Sokoban (推箱子)                                             │
    // └──────────────────────────────────────────────────────────────┘
    const SOKOBAN_LEVELS = [
      [
        '  ###   ',
        '  #.#   ',
        '  # ####',
        '###$ $.#',
        '#. $@###',
        '####$#  ',
        '   #.#  ',
        '   ###  ',
      ],
      [
        '#####    ',
        '#@  #    ',
        '# $$# ###',
        '# $ # #.#',
        '### ###.#',
        ' ##    .#',
        ' #   #  #',
        ' #   ####',
        ' #####   ',
      ],
      [
        ' #######  ',
        ' #     ###',
        '##$###   #',
        '# @ $  $ #',
        '# ..# $ ##',
        '##..#   # ',
        ' ######## ',
      ],
      [
        ' #### ',
        '##  # ',
        '#@$ # ',
        '##$ ##',
        '## $ #',
        '#.$  #',
        '#..*.#',
        '######',
      ],
      [
        ' #####  ',
        ' #@ ### ',
        ' # $  # ',
        '### # ##',
        '#.# #  #',
        '#.$  # #',
        '#.   $ #',
        '########',
      ],
      [
        '   #######   ',
        '####     #   ',
        '#   .### #   ',
        '# # #    ##  ',
        '# # $ $#. #  ',
        '# #  *  # #  ',
        '# .#$ $ # #  ',
        '##    # # ###',
        ' # ###.    @#',
        ' #     ##   #',
        ' ############',
      ],
      [
        '   #######',
        '  ##  # @#',
        '  #   #  #',
        '  #$ $ $ #',
        '  # $##  #',
        '### $ # ##',
        '#.....  # ',
        '######### ',
      ],
      [
        '   ###### ',
        ' ###    # ',
        '##. $## ##',
        '#..$ $  @#',
        '#.. $ $ ##',
        '######  # ',
        '     #### ',
      ],
      [
        ' ######### ',
        ' #  ##   # ',
        ' #   $   # ',
        ' #$ ### $# ',
        ' # #...# # ',
        '## #...# ##',
        '# $  $  $ #',
        '#     # @ #',
        '###########',
      ],
      [
        '  ######',
        '  #    #',
        '###$$$ #',
        '#@ $.. #',
        '# $...##',
        '####  # ',
        '   #### ',
      ],
      [
        ' ####  #####',
        '##  #  #   #',
        '# $ ####$  #',
        '#  $.... $ #',
        '##    # @ ##',
        ' ########## ',
      ],
      [
        '  ##### ',
        '###  @# ',
        '#  $. ##',
        '#  .$. #',
        '### *$ #',
        '  #   ##',
        '  ##### ',
      ],
      [
        '  ####  ',
        '  #..#  ',
        ' ## .## ',
        ' #  $.# ',
        '## $  ##',
        '#  #$$ #',
        '#  @   #',
        '########',
      ],
      [
        '########',
        '#  #   #',
        '# $..$ #',
        '#@$.* ##',
        '# $..$ #',
        '#  #   #',
        '########',
      ],
      [
        ' #######',
        '##    # ',
        '# $ $$ #',
        '#......#',
        '# $$ $ #',
        '### @###',
        '  ####  ',
      ],
      [
        '  ######  ',
        '  #    ###',
        '  # $    #',
        '### $ ## #',
        '#... $   #',
        '#...$#$ ##',
        '#### # $ #',
        '   #  @  #',
        '   #######',
      ],
      [
        '######   ',
        '#    #   ',
        '# $$$##  ',
        '#  #..###',
        '##  ..$ #',
        ' # @    #',
        ' ########',
      ],
      [
        '  ########',
        '  #   #. #',
        ' ##  $...#',
        ' #  $ #*.#',
        '## ##$# ##',
        '#   $  $ #',
        '#   #    #',
        '#######@ #',
        '      ####',
      ],
      [
        ' #######  ',
        ' #.... #  ',
        '###...$###',
        '#  $#$ $ #',
        '# $$  #$ #',
        '#    #   #',
        '#### @ ###',
        '   #####  ',
      ],
      [
        '#######',
        '#..$..#',
        '#..#..#',
        '# $$$ #',
        '#  $  #',
        '# $$$ #',
        '#  #@ #',
        '#######',
      ],
      [
        '   ######  ',
        '   # ...#  ',
        '####....#  ',
        '#  ###$ ###',
        '# $ $  $$ #',
        '#@ $ $    #',
        '#   ###   #',
        '##### #####',
      ],
      [
        '######## ',
        '#      # ',
        '# #$$  # ',
        '# ...# # ',
        '##...$ ##',
        ' # ## $ #',
        ' #$  $  #',
        ' #  #  @#',
        ' ########',
      ],
      [
        '  #####   ',
        '###   ####',
        '#   $ $  #',
        '# $   $ @#',
        '###$$#####',
        '  #  ..#  ',
        '  #....#  ',
        '  ######  ',
      ],
      [
        '######   #####',
        '#    ### #  .#',
        '#  $ $ # #...#',
        '# #  $ ###  .#',
        '#  $$$   $ @.#',
        '###  $  $#  .#',
        '  #  $#$ #...#',
        '  ##     #  .#',
        '   ###########',
      ],
      [
        '     ######',
        ' #####.   #',
        ' #  #..## #',
        ' #  $..   #',
        ' #  # .# ##',
        '### ##$#  #',
        '# $    $$ #',
        '# #$#  #  #',
        '#@  #######',
        '#####      ',
      ],
      [
        ' #########   ',
        ' #   ##  ####',
        ' # $        #',
        ' ##$### ##  #',
        ' #  ## * # ##',
        ' # $...... # ',
        '## ### . # # ',
        '#     $###$# ',
        '#   #    $@# ',
        '#####$# #### ',
        '    #   #    ',
        '    #####    ',
      ],
      [
        '      #########',
        '      #       #',
        '      # # # # #',
        '      #  $ $# #',
        '#######   $   #',
        '#..#  ## $ $# #',
        '#..   ## $ $  #',
        '#..#  ## ######',
        '#..# # $ $ #   ',
        '#..     $  #   ',
        '#  ### @ ###   ',
        '#### #####     ',
      ],
      [
        '    ####        ',
        '#####  #        ',
        '#  $ $ # #######',
        '#   $  # #*.*.*#',
        '## $ $ ###.*.*.#',
        ' #$ $  #  *.*.*#',
        ' #@$ $    .*.*##',
        ' #$ $  #  *.*.*#',
        '## $ $ ###.*.*.#',
        '#   $  # #*.*.*#',
        '#  $ $ # #######',
        '#####  #        ',
        '    ####        ',
      ],
      [
        '######## ',
        '#......# ',
        '#  $ # ##',
        '# $ # $ #',
        '##$ $ $ #',
        ' #  @   #',
        ' ########',
      ],
      [
        '  ##########',
        '###   .    #',
        '#   ##$##  #',
        '# @$. . .$##',
        '## $##$## # ',
        ' #    .   # ',
        ' ########## ',
      ],
      [
        '   ######',
        '####.  @#',
        '#  $$$  #',
        '#.##.##.#',
        '#   $   #',
        '#  $.# ##',
        '####   # ',
        '   ##### ',
      ],
      [
        ' ###### ',
        ' #. ..# ',
        ' #. $.# ',
        '###  $##',
        '# $  $ #',
        '# #$## #',
        '#   @  #',
        '########',
      ],
      [
        '    ######    ',
        '  ###    ###  ',
        '  #   #$   ###',
        '  #   $   $$ #',
        '  # $$ #$    #',
        '  ##   $   $ #',
        '###### #$#####',
        '#..@ #$  #    ',
        '#.#..  $##    ',
        '#....$# #     ',
        '#....   #     ',
        '#########     ',
      ],
      [
        '###############',
        '#      #      #',
        '# $ #$ # $##$ #',
        '# #  $ #      #',
        '#   ##$#$##$$ #',
        '# # # ... #   #',
        '# $  . # .$ # #',
        '# $#@$...# #  #',
        '#    . # .  $ #',
        '# ##.$###$. # #',
        '# # $..... ## #',
        '#             #',
        '###############',
      ],
      [
        '######### ',
        '#   ##  # ',
        '# # $ $ # ',
        '#  *.#  # ',
        '## #.@.## ',
        '##$###*###',
        '#        #',
        '#   ## # #',
        '######   #',
        '     #####',
      ],
      [
        '########       ',
        '#      #       ',
        '# $$   ###     ',
        '#  $ $$$ ##### ',
        '## ## ...    ##',
        ' # #@#...###$ #',
        ' # # $...     #',
        '## # $...$ # ##',
        '#  ##### ### # ',
        '#      $   $ # ',
        '###########  # ',
        '          #### ',
      ],
      [
        '   ##### ',
        '   # @ # ',
        '   #$$$# ',
        '####   # ',
        '#   .#$##',
        '# $.$. .#',
        '#  #.#.##',
        '######## ',
      ],
      [
        '############',
        '#... #     #',
        '#..  # ##  #',
        '#..     #  #',
        '#..  # $## #',
        '#... #$ $  #',
        '######  $$ #',
        ' ##  $ $$  #',
        ' #@ $$$  # #',
        ' ## $ ##   #',
        '  #        #',
        '  ##########',
      ],
      [
        '#########  ',
        '#       #  ',
        '#  $ $ $#  ',
        '## #$## #  ',
        ' # .. ..## ',
        ' ##.. .. # ',
        '  # ##$# ##',
        '  #$ $ $  #',
        '  #      @#',
        '  #########',
      ],
      [
        '#####      ####',
        '#@  ########  #',
        '## $       $  #',
        ' # # #  ####  #',
        ' #  $   ####$##',
        ' #$ ## # $ $ # ',
        '## $  $#     # ',
        '#   #      # # ',
        '#   #####$#### ',
        '#####   #   #  ',
        '    #...  $ #  ',
        '    #....#  #  ',
        '    #....####  ',
        '    ######     ',
      ],
      [
        '     #####',
        ' #####   #',
        ' # .. $# #',
        ' # #.*   #',
        '## *.#$ ##',
        '# $  $  # ',
        '#   ## @# ',
        '######### ',
      ],
      [
        '##### #######',
        '#   ###  #  #',
        '# $     $ @ #',
        '## #$##.##  #',
        ' #  ...*. $ #',
        ' # $# #.# # #',
        ' ##    $    #',
        '  #  ########',
        '  ####       ',
      ],
      [
        '         ###   ',
        '    ######@##  ',
        '    #....#$ ## ',
        '    #....# $ # ',
        '    #.... $  # ',
        '    # ...#   # ',
        '###### ##### ##',
        '# $ $   $  #  #',
        '#    $$   $ $ #',
        '### $ $ $  ####',
        '  ##   $ $ #   ',
        '   #  ######   ',
        '   ####        ',
      ],
      [
        '   #####   ',
        ' ###   ### ',
        '##  @$ $ # ',
        '#  ## ## ##',
        '# $.#.$   #',
        '# #.#*#   #',
        '# $...  ###',
        '###$# ###  ',
        '  #   #    ',
        '  #####    ',
      ],
      [
        '      ####     ',
        '      #  ######',
        '      #    #  #',
        '      # $$    #',
        '#######$#  #  #',
        '#  #. .. ###$##',
        '#  #.#*.$     #',
        '#  #.#.*# #   #',
        '# $$....# #####',
        '# @$ # ## #    ',
        '# $$$#    #    ',
        '#    ######    ',
        '######         ',
      ],
      [
        '####           ',
        '#  ###         ',
        '# $  ###       ',
        '# $ $  ###     ',
        '# $ $ $  ###   ',
        '# $ $ $    #   ',
        '# $ $  #   ##  ',
        '# $  ## $$$ #  ',
        '#@ ####     ## ',
        '## # #.$$$$$.# ',
        ' # ###.......##',
        ' #   .*******.#',
        ' ####.........#',
        '    ###########',
      ],
      [
        '#######    ',
        '# @#  #####',
        '# $$  $   #',
        '#  #.##$# #',
        '##$#...   #',
        '## ...##$##',
        '#  ##.##  #',
        '#  $  $   #',
        '#  #   #  #',
        '###########',
      ],
      [
        '   #####   ',
        '   # @ #   ',
        '   # $ #   ',
        '   #$.$#   ',
        ' ###.$.##  ',
        '## .$.$.###',
        '#  $.$.$  #',
        '#    .    #',
        '###########',
      ],
      [
        '#############',
        '#  $ $ $.*..#',
        '# $ $ $ *...#',
        '#  $ $ $.*..#',
        '# $ $ $ *...#',
        '#  $ $ $.*..#',
        '# $ $ $ *...#',
        '#  $ $ $.*..#',
        '# $ $ $ *...#',
        '#  $ $ $.*..#',
        '#@$ $ $ *...#',
        '#############',
      ],
      [
        '             # ',
        '            ## ',
        '           ### ',
        '          #   #',
        '   ######## # #',
        '  # $ $ $ $   #',
        ' ## #.#.#.#@$# ',
        '###.......   ##',
        ' ## # # # #$## ',
        '  # $ $ $ $   #',
        '   ######## # #',
        '          #   #',
        '           ### ',
        '            ## ',
      ],
      [
        '#######  ',
        '#  .$ ###',
        '# .$.$  #',
        '#*$.$.@ #',
        '# .$.$ ##',
        '#  .$  # ',
        '######## ',
      ],
      [
        '         #####  ',
        '         #   #  ',
        '########## * ###',
        '#          .   #',
        '# $$$$****$...@#',
        '#          .   #',
        '########## * ###',
        '         #   #  ',
        '         #####  ',
      ],
      [
        '     ####    ',
        '######  #####',
        '#@$    $  $ #',
        '#$### $ # # #',
        '#  #  # $   #',
        '# $#    # ###',
        '#  $ #$#   # ',
        '#......... # ',
        '########   # ',
        '       ##### ',
      ],
      [
        ' #########   ',
        ' #   ##  ####',
        ' # $        #',
        ' ##$### ##  #',
        ' #  ## * # ##',
        ' # $...... # ',
        '## ### . # # ',
        '#     $###$# ',
        '#   #    $@# ',
        '#####$# #### ',
        '    #   #    ',
        '    #####    ',
      ],
      [
        '###########',
        '#    #    #',
        '# $@$$$$$ #',
        '#         #',
        '##### #####',
        '   #.  #   ',
        '   #.  #   ',
        '   #...#   ',
        '   #.  #   ',
        '   #####   ',
      ],
      [
        '  #####  ',
        '  # @ #  ',
        '  # $ #  ',
        '### . ###',
        '#   *   #',
        '# ***** #',
        '#   *   #',
        '###$*$###',
        '  # . #  ',
        '  # * #  ',
        '  # . #  ',
        '  #####  ',
      ],
      [
        '##############',
        '#.           #',
        '#.$ $ $ $ $  #',
        '#.#########  #',
        '#.#.* $ ..$*##',
        '#.# $ $ *.$@# ',
        '#.#.  $ ..$$# ',
        '#.#########.# ',
        '#.          # ',
        '#.#$#$#$#$#$# ',
        '#.          # ',
        '############# ',
      ],
      [
        '############  ',
        '#..  #     ###',
        '#..  # $  $  #',
        '#..  #$####  #',
        '#..    @ ##  #',
        '#..  # #  $ ##',
        '###### ##$ $ #',
        '  # $  $ $ $ #',
        '  #    #     #',
        '  ############',
      ],
      [
        '       ####   ',
        '########  ####',
        '#   ##.....  #',
        '#  $  ##...# #',
        '##  $  ### # #',
        ' # # $  #    #',
        ' #  # $  #   #',
        ' #   # $  #  #',
        ' #    # $ # ##',
        ' ####  # $  # ',
        '    ##  # $ # ',
        '     ##@#   # ',
        '      ####### ',
      ],
      [
        '####      ####',
        '#..########..#',
        '#*.*.....*.*.#',
        '# $ $ $ $ $ $#',
        '#$ $ $@$ $ $ #',
        '# $ $ $ $ $ $#',
        '#$ $ $ $ $ $ #',
        '#.*.*.....*.*#',
        '#..########..#',
        '####      ####',
      ],
      [
        '    #####   ',
        '   ##   ####',
        '   #  .* $ #',
        '#### #.#   #',
        '#    .*.#@##',
        '# # ##$## # ',
        '#     $ $ # ',
        '##  #   ### ',
        ' ########   ',
      ],
      [
        '######   ',
        '#    #   ',
        '# $  ####',
        '# $*..* #',
        '# *..*$ #',
        '####  $ #',
        '   # @  #',
        '   ######',
      ],
      [
        '   ##### ',
        '####.  ##',
        '# $.$.  #',
        '#@$# #$ #',
        '# $. .  #',
        '####$#$ #',
        '  #. .  #',
        '  #######',
      ],
      [
        '############',
        '#    ... $ #',
        '# $$$*** $@#',
        '#    ... $ #',
        '############',
      ],
      [
        '##########',
        '##       #',
        '#   #$#$ #',
        '# $$  .$.#',
        '# @###...#',
        '##########',
      ],
      [
        ' ####     ',
        ' #  ##### ',
        '##$ ##  # ',
        '#  $@$  # ',
        '#   ##$ # ',
        '###.## ###',
        ' #...$ $ #',
        ' ##..    #',
        '  ########',
      ],
      [
        '##### ####      ',
        '#...# #  ####   ',
        '#...###  $  #   ',
        '#....## $  $### ',
        '##....##   $  # ',
        '###... ## $ $ # ',
        '# ##    #  $  # ',
        '#  ## # ### ####',
        '# $ # #$  $    #',
        '#  $ @ $    $  #',
        '#   # $ $$ $ ###',
        '#  ######  ###  ',
        '# ##    ####    ',
        '###             ',
      ],
      [
        '#######',
        '#. . .#',
        '# $$$ #',
        '#.$@$.#',
        '# $$$ #',
        '#. . .#',
        '#######',
      ],
      [
        '      #### ',
        '#######  # ',
        '#     $  # ',
        '#   $##@$# ',
        '##$#...# # ',
        ' # $...  # ',
        ' # #. .# ##',
        ' #   # #$ #',
        ' #$  $    #',
        ' #  #######',
        ' ####      ',
      ],
      [
        '   #########',
        '   #   #   #',
        '   #       #',
        '#####*### ##',
        '#   ...   # ',
        '# # #*###$##',
        '# $    $   #',
        '#####@ #   #',
        '    ########',
      ],
      [
        '#####           ',
        '#...# #####     ',
        '#...###   #     ',
        '#....   $$##### ',
        '#....  #  #   ##',
        '#..#$#### #$#  #',
        '## $  #     $$ #',
        '#  $# @ $ $$#  #',
        '# $ $ $ #   $ ##',
        '#   #  $ ##   # ',
        '######   ###### ',
        '     #####      ',
      ],
      [
        '###############',
        '###.#      ####',
        '##..# $  $ #  #',
        '#...# ## $ #  #',
        '#.....  #$$   #',
        '##....$    #$ #',
        '#### #######  #',
        '#   $        ##',
        '#  $ #  $# $ ##',
        '# $### $ # $$ #',
        '#   @#  ##    #',
        '###############',
      ],
      [
        '       ########',
        '       #  #   #',
        ' ####### $$...#',
        ' #        #...#',
        ' # ######$#...#',
        '## #      #...#',
        '#  # #$ $ #####',
        '# # $ $ $ #    ',
        '# @  $ #  #    ',
        '#####$ $$ #    ',
        '    #     #    ',
        '    #######    ',
      ],
      [
        '       #####',
        '  ######   #',
        '###    . $ #',
        '# $  #$.#$##',
        '#  #  @.#  #',
        '## ####.   #',
        ' # $  #*####',
        ' # ## #.  # ',
        ' #     .# # ',
        ' ###$     # ',
        '   #  ##### ',
        '   ####     ',
      ],
      [
        '    ####    ',
        '#####  #####',
        '#    $   $ #',
        '#  $#$##   #',
        '### #.*. ###',
        '  # ... @#  ',
        '  ## #$###  ',
        '   #   #    ',
        '   #####    ',
      ],
      [
        '   ########',
        '####    . #',
        '#  $ $ $. #',
        '#  .####.##',
        '# $.$ $ @# ',
        '#  .  #### ',
        '#######    ',
      ],
      [
        '  #####    ',
        '  #   #    ',
        '###$.$#####',
        '#   . $   #',
        '# ##$## @ #',
        '#   . #####',
        '### . #    ',
        '  #   #    ',
        '  #####    ',
      ],
      [
        ' #####     ',
        ' # @ ######',
        ' # #..*   #',
        ' # ...#   #',
        '##$## $ $ #',
        '#   #$#####',
        '#   $   #  ',
        '##### # #  ',
        '    #   #  ',
        '    #####  ',
      ],
      [
        '     ######   ',
        '   ###    ##  ',
        '   #   ##  #  ',
        ' ###$##  # #  ',
        '##     ..# #  ',
        '#  $#$#*.# #  ',
        '# $$@ #.*# ###',
        '#  $$ #..#   #',
        '##    #..$   #',
        ' ###$##. # ###',
        '   #  ###  #  ',
        '   ##     ##  ',
        '    #######   ',
      ],
      [
        '     ####### ',
        '     #  #  # ',
        '     #  $$ # ',
        '###### $#  # ',
        '#...### #  ##',
        '#.  #  $ #  #',
        '#.    $ $ $ #',
        '#.  #  $ #  #',
        '#...### #  ##',
        '###### $   # ',
        '     #@ #  # ',
        '     ####### ',
      ],
      [
        '          ######',
        '          #    #',
        '#####   ### ## #',
        '#.. ##### $  # #',
        '#..     $   $# #',
        '#..  ## ##   # #',
        '#.. ## $ #$ $# #',
        '#.. #     $  # #',
        '#.. #  $ ###$  #',
        '#.. # $ $  $ ###',
        '### ## # $    # ',
        '  #    #@## $ # ',
        '  #########  ## ',
        '          ####  ',
      ],
      [
        '       #       ',
        '     #####     ',
        '   ### @ ###   ',
        '   #  $ $  #   ',
        '   # *.*.* #   ',
        '  ## .$ $. ##  ',
        ' ### *.*.* ### ',
        '####  $ $  ####',
        '   ######  #   ',
        '    ##   ##    ',
      ],
      [
        ' ############## ',
        ' # @ * * * #  ##',
        ' #$#  * *  #   #',
        ' # # * * *     #',
        ' # #  * *  ## ##',
        ' # # * * * ## # ',
        ' # #  * *  ## # ',
        ' # # * * * ## # ',
        ' # #  * *  ## # ',
        ' # # * . * ## ##',
        '## ##########  #',
        '#              #',
        '#   #########  #',
        '#####       ####',
      ],
      [
        ' ############# ',
        ' #    #  ##  # ',
        ' #$$$ # $$  $##',
        ' # $  #  .... #',
        ' #  $  #$.##. #',
        ' #  # $# ....##',
        '##$ $  #$.##. #',
        '# $  $ @$.... #',
        '#   ###  ######',
        '##### ####     ',
      ],
      [
        '     #########',
        '     #       #',
        '     #  $#$# #',
        ' ######  # $ #',
        ' #   # $  $  #',
        '## $     ### #',
        '#   #$####   #',
        '#    $ ### ###',
        '#####.. @# ## ',
        '   #...$ $$ # ',
        '   #...#    # ',
        '   #...###### ',
        '   #####      ',
      ],
      [
        '####     ####   ',
        '#  #######..### ',
        '# $ $ $  #....# ',
        '# $   $$ #***.# ',
        '# $ $ $  #..*.# ',
        '#  $ $ $ #*.*.# ',
        '## $ $ $ .*.*.##',
        '#  $ $ $ .*.*.@#',
        '#  $ $ $ #*.*.##',
        '# $ $ $  #..*.# ',
        '# $   $$ #***.# ',
        '# $ $ $  #....# ',
        '#  #######..### ',
        '####     ####   ',
      ],
      [
        '      #####     ',
        '#######   #     ',
        '#   ##.   #     ',
        '#  $#..  ###    ',
        '##  ...#$$ #####',
        ' # $.#.$       #',
        ' # $###$## # $ #',
        ' #   #     $$# #',
        ' ##$$# ##$#$   #',
        ' #... $@ $   ###',
        ' #...#$#   ###  ',
        ' #...  #####    ',
        ' #######        ',
      ],
      [
        ' ####  ######',
        ' #  ####    #',
        '##*   * **  #',
        '# $ *    *# #',
        '# .   ###   #',
        '######   #@##',
        '# * . *  ** #',
        '#   #   #   #',
        '##*   * #$# #',
        ' #  #####   #',
        ' ####   #####',
      ],
      [
        ' ######### ',
        ' #   #   # ',
        ' # $$$$$ # ',
        '## $ $ $ # ',
        '# $  @   # ',
        '# $ #### ##',
        '#  #..... #',
        '##  ..... #',
        ' ##########',
      ],
      [
        '   #######     ',
        '   #     #     ',
        '   # $ $ ##    ',
        '   #####..#####',
        '######..*.  $ #',
        '#  $@$....#$$ #',
        '#   $ #$###   #',
        '#####       ###',
        '    ###  ####  ',
        '      #  #     ',
        '      ####     ',
      ],
      [
        '#####     ',
        '#   ######',
        '# $ .. $ #',
        '##$ ..$$@#',
        ' #  .. $ #',
        ' #########',
      ],
      [
        '  #####     ',
        '  #   ######',
        '###$#.     #',
        '# $ ...# $ #',
        '#@ $.#*$   #',
        '####    ####',
        '   ######   ',
      ],
      [
        '    #####      ',
        '#####   #      ',
        '#   $ @ #      ',
        '#  $ #.#####   ',
        '##$ ##.##  ####',
        ' #  ..... $#  #',
        ' # $##.##  #$ #',
        ' #   #.##     #',
        ' ### $ ##### ##',
        '   # #$     $ #',
        '   #    ###   #',
        '   ###### #####',
      ],
      [
        '#######',
        '#  *  #',
        '# @.$ #',
        '# $.  #',
        '#*.***#',
        '#  *  #',
        '# $*$ #',
        '#  .  #',
        '#######',
      ],
      [
        '  #########     ',
        '  #    #  #     ',
        '### #$  $ ####  ',
        '#  $  ##..#  ###',
        '# #  $ #..$ $  #',
        '# $$  $#..  #  #',
        '##  #  ...#$   #',
        ' #$ @ #...# $  #',
        ' #    #...$   ##',
        ' # ##$ ###   ## ',
        ' #   $     ###  ',
        ' #  ########    ',
        ' ####           ',
      ],
      [
        '   ########## ',
        '####......  # ',
        '#   .....#  # ',
        '#  #...... ## ',
        '## ####$##$#  ',
        '#@$  $ $   ###',
        '# $$    ##   #',
        '# #  $$##  # #',
        '#   $  # $$  #',
        '#  $  $   #$ #',
        '####   # $ $ #',
        '   #   #     #',
        '   ###########',
      ],
      [
        '      #########',
        '      #       #',
        '      #$ $$$  #',
        '      #   # $ #',
        '      #   $@$ #',
        '    ###$ $ # ##',
        '    #   $#$# # ',
        '##### #  #   # ',
        '#...  # $# ### ',
        '#.....   # #   ',
        '#.....# $# #   ',
        '########   #   ',
        '       #####   ',
      ],
      [
        ' ##### ###### ',
        ' #   ###    # ',
        '## $ $ #$ #$# ',
        '#  $ @ $  $ ##',
        '# #  ## #....#',
        '#  ## $ #.##.#',
        '##  $    ....#',
        ' # $$ #$#....#',
        ' #   #   #$ ##',
        ' ##### $    # ',
        '     ####  ## ',
        '        ####  ',
      ],
      [
        '####           ',
        '#  #           ',
        '#  ##########  ',
        '#    ##     #  ',
        '#..#    $$# #  ',
        '#..  ##   $ ###',
        '#..#  ##$# $  #',
        '#..   # @$ $  #',
        '#..#  # $ $   #',
        '# .   # $ $ ###',
        '#  #  #   ###  ',
        '#  #    ###    ',
        '#########      ',
      ],
      [
        '         #####  ',
        '        #     # ',
        '       #  $##  #',
        '      #  #   $ #',
        '#  #  # #  # # #',
        ' # #  # $ $  $ #',
        '  ####### #$#  #',
        '  #  $ $      # ',
        '  #@..$ **.###  ',
        '   #......##### ',
        '    ############',
      ],
    ];

    function sokobanParse(levelIndex) {
      const index = Math.max(0, Math.min(SOKOBAN_LEVELS.length - 1, Number(levelIndex) || 0));
      const rows = SOKOBAN_LEVELS[index];
      const cols = rows.reduce((max, line) => Math.max(max, line.length), 0);
      const walls = [];
      const targets = [];
      const boxes = [];
      let player = { r: 1, c: 1 };
      for (let r = 0; r < rows.length; r += 1) {
        const line = rows[r];
        for (let c = 0; c < cols; c += 1) {
          const ch = line[c] || ' ';
          if (ch === '#') walls.push({ r, c });
          if (ch === '.' || ch === '*' || ch === '+') targets.push({ r, c });
          if (ch === '$' || ch === '*') boxes.push({ r, c });
          if (ch === '@' || ch === '+') player = { r, c };
        }
      }
      return { rows: rows.length, cols, walls, targets, boxes, player };
    }

    const sokobanKey = (cell) => `${cell.r},${cell.c}`;

    function sokobanWalls(parsed) {
      return new Set(parsed.walls.map(sokobanKey));
    }

    function sokobanTargets(parsed) {
      return new Set(parsed.targets.map(sokobanKey));
    }

    function sokobanIsSolved(state) {
      if (!state.boxes.length) return false;
      const parsed = sokobanParse(state.level);
      const targets = sokobanTargets(parsed);
      return state.boxes.every((box) => targets.has(sokobanKey(box)));
    }

    function sokobanBoard(level) {
      const parsed = sokobanParse(level);
      return {
        level,
        player: { ...parsed.player },
        boxes: parsed.boxes.map((box) => ({ ...box })),
        moves: 0,
        solved: false,
      };
    }

    function freshSokobanState(best) {
      const bestMoves = Array.isArray(best)
        ? best.slice(0, SOKOBAN_LEVELS.length).map((value) => (Number(value) > 0 ? Number(value) : null))
        : SOKOBAN_LEVELS.map(() => null);
      return { ...sokobanBoard(0), best: bestMoves };
    }

    function sanitizeSokoban(state) {
      const level = state && Number.isInteger(state.level)
        ? Math.max(0, Math.min(SOKOBAN_LEVELS.length - 1, state.level))
        : 0;
      const best = Array.isArray(state && state.best) ? state.best : [];
      const bestMoves = SOKOBAN_LEVELS.map((_, index) => {
        const value = Number(best[index]);
        return value > 0 ? value : null;
      });
      return { ...sokobanBoard(level), best: bestMoves };
    }

    function sokobanMove(state, dr, dc) {
      if (state.solved) return state;
      const parsed = sokobanParse(state.level);
      const walls = sokobanWalls(parsed);
      const targets = sokobanTargets(parsed);
      const next = { r: state.player.r + dr, c: state.player.c + dc };
      if (!Number.isInteger(next.r) || !Number.isInteger(next.c)) return state;
      if (next.r < 0 || next.c < 0 || next.r >= parsed.rows || next.c >= parsed.cols) return state;
      if (walls.has(sokobanKey(next))) return state;

      const boxes = state.boxes.map((box) => ({ ...box }));
      const boxIndex = boxes.findIndex((box) => box.r === next.r && box.c === next.c);
      if (boxIndex >= 0) {
        const push = { r: next.r + dr, c: next.c + dc };
        if (push.r < 0 || push.c < 0 || push.r >= parsed.rows || push.c >= parsed.cols) return state;
        if (walls.has(sokobanKey(push))) return state;
        if (boxes.some((box) => box.r === push.r && box.c === push.c)) return state;
        boxes[boxIndex] = push;
      }

      const moves = state.moves + 1;
      const solved = boxes.length > 0 && boxes.every((box) => targets.has(sokobanKey(box)));
      const best = state.best ? state.best.slice() : SOKOBAN_LEVELS.map(() => null);
      if (solved) {
        const current = best[state.level];
        best[state.level] = current ? Math.min(current, moves) : moves;
      }
      return {
        ...state,
        player: next,
        boxes,
        moves,
        solved,
        best,
      };
    }

    function sokobanReset(state) {
      return { ...sokobanBoard(state.level), best: state.best ? state.best.slice() : SOKOBAN_LEVELS.map(() => null) };
    }

    function sokobanNext(state) {
      const level = (state.level + 1) % SOKOBAN_LEVELS.length;
      return { ...sokobanBoard(level), best: state.best ? state.best.slice() : SOKOBAN_LEVELS.map(() => null) };
    }

    const sokobanBoardStyle = {
      position: 'relative',
      flexShrink: 0,
      display: 'grid',
      background: '#1b2026',
      borderRadius: 6,
      border: '1px solid var(--dsw-alias-border-l1)',
      overflow: 'hidden',
      touchAction: 'none',
    };

    function GameSokoban({ initial, onChange, focused, active = true }) {
      const [state, setState] = useState(() => sanitizeSokoban(initial) || freshSokobanState([]));
      const stateRef = useRef(state);
      const onChangeRef = useRef(onChange);
      const touch = useRef(null);

      useEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);

      useEffect(() => {
        stateRef.current = state;
      }, [state]);

      const commit = useCallback((next, notify) => {
        if (next === stateRef.current) return;
        stateRef.current = next;
        setState(next);
        if (notify && onChangeRef.current) onChangeRef.current(next);
      }, []);

      const move = useCallback((dr, dc) => {
        if (!active) return;
        commit(sokobanMove(stateRef.current, dr, dc), true);
      }, [active, commit]);

      const restart = useCallback(() => {
        commit(sokobanReset(stateRef.current), true);
      }, [commit]);

      const nextLevel = useCallback(() => {
        commit(sokobanNext(stateRef.current), true);
      }, [commit]);

      useEffect(() => {
        if (!focused || !active) return undefined;
        const onKeyDown = (event) => {
          if (isTypingTarget(event.target)) return;
          const key = event.key;
          if ((key === 'Enter' || key === 'NumpadEnter') && stateRef.current.solved) {
            event.preventDefault();
            nextLevel();
            return;
          }
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') { event.preventDefault(); move(0, -1); return; }
          if (key === 'ArrowRight' || key === 'd' || key === 'D') { event.preventDefault(); move(0, 1); return; }
          if (key === 'ArrowUp' || key === 'w' || key === 'W') { event.preventDefault(); move(-1, 0); return; }
          if (key === 'ArrowDown' || key === 's' || key === 'S') { event.preventDefault(); move(1, 0); return; }
          if (key === 'r' || key === 'R') { event.preventDefault(); restart(); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [focused, active, move, restart, nextLevel]);

      const onTouchStart = useCallback((event) => {
        const point = event.touches[0];
        if (point) touch.current = { x: point.clientX, y: point.clientY };
      }, []);

      const onTouchEnd = useCallback((event) => {
        const start = touch.current;
        touch.current = null;
        const point = event.changedTouches[0];
        if (!start || !point) return;
        const dx = point.clientX - start.x;
        const dy = point.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
        else move(dy > 0 ? 1 : -1, 0);
      }, [move]);

      const parsed = sokobanParse(state.level);
      const tile = Math.min(
        Math.floor(200 / parsed.cols),
        Math.floor(210 / parsed.rows),
        28,
      );
      const targets = sokobanTargets(parsed);
      const walls = sokobanWalls(parsed);
      const boxes = new Set(state.boxes.map(sokobanKey));

      const cells = [];
      for (let r = 0; r < parsed.rows; r += 1) {
        for (let c = 0; c < parsed.cols; c += 1) {
          const key = `${r},${c}`;
          const isWall = walls.has(key);
          const isTarget = targets.has(key);
          const isBox = boxes.has(key);
          const isPlayer = state.player.r === r && state.player.c === c;
          const boxOnTarget = isBox && isTarget;
          cells.push(h('div', {
            key,
            style: {
              position: 'relative',
              width: tile,
              height: tile,
              background: isWall ? '#3a3f46' : 'transparent',
              boxSizing: 'border-box',
              border: isWall ? '1px solid #2b2f35' : 'none',
            },
          }, [
            isTarget
              ? h('div', {
                  key: 'target',
                  style: {
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: Math.max(4, tile * 0.28),
                    height: Math.max(4, tile * 0.28),
                    marginLeft: -Math.max(4, tile * 0.28) / 2,
                    marginTop: -Math.max(4, tile * 0.28) / 2,
                    borderRadius: '50%',
                    background: '#ffd166',
                    opacity: 0.8,
                  },
                })
              : null,
            isBox
              ? h('div', {
                  key: 'box',
                  style: {
                    position: 'absolute',
                    left: 2,
                    top: 2,
                    right: 2,
                    bottom: 2,
                    borderRadius: 3,
                    background: boxOnTarget ? '#4cd964' : '#c58b4a',
                    border: '1px solid rgba(0,0,0,0.35)',
                    boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.35)',
                  },
                })
              : null,
            isPlayer
              ? h('div', {
                  key: 'player',
                  style: {
                    position: 'absolute',
                    left: '18%',
                    top: '18%',
                    width: '64%',
                    height: '64%',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 34% 28%, #9fd0ff 0%, #4aa3ff 45%, #1f6fbf 100%)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  },
                })
              : null,
          ]));
        }
      }

      return h('div', {
        style: { display: 'flex', flexDirection: 'column', height: '100%' },
        onTouchStart,
        onTouchEnd,
      }, [
        h('div', { key: 'chips' }, chips([
          { label: '关卡', value: `${state.level + 1}/${SOKOBAN_LEVELS.length}` },
          { label: '步数', value: state.moves },
          { label: '最佳', value: state.best && state.best[state.level] ? state.best[state.level] : '—' },
        ])),
        h('div', {
          key: 'wrap',
          style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
        }, h('div', {
          key: 'board',
          style: {
            ...sokobanBoardStyle,
            width: parsed.cols * tile,
            height: parsed.rows * tile,
            gridTemplateColumns: `repeat(${parsed.cols}, ${tile}px)`,
            gridTemplateRows: `repeat(${parsed.rows}, ${tile}px)`,
          },
          title: '方向键 / WASD 移动并推箱，R 重置本关',
        }, [
          ...cells,
          state.solved
            ? h('div', { key: 'done', style: overlayStyle('rgba(12, 18, 26, 0.86)', '#ffffff') }, [
                h('div', { key: 'title', style: { marginBottom: 4 } }, '过关！'),
                h('div', { key: 'moves', style: { fontSize: 10, marginBottom: 2, fontWeight: 500 } },
                  `${state.moves} 步 · 最佳 ${state.best[state.level]} 步`),
                h('div', { key: 'enter', style: { fontSize: 10, marginBottom: 8 } }, '按 Enter 进入下一关'),
                h('button', {
                  key: 'next',
                  type: 'button',
                  style: againButtonStyle,
                  onClick: nextLevel,
                }, '下一关'),
              ])
            : null,
        ])),
        h('div', {
          key: 'hint',
          style: { marginTop: 2, fontSize: 9, textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' },
        }, state.solved
          ? '按 Enter 进入下一关 · R 重玩本关'
          : (focused ? '方向键 / WASD 推箱 · R 重置' : '点击卡片后方向键 / WASD 推箱')),
      ]);
    }

    // │ Card                                                         │
    // └──────────────────────────────────────────────────────────────┘
    const GAME_IDS = ['2048', 'tetris', 'gomoku', 'klotski', 'snake', 'schulte', 'breakout', 'sokoban'];
    const GAME_LABELS = {
      '2048': '2048',
      tetris: 'Tetris',
      gomoku: '五子棋',
      klotski: '华容道',
      snake: '贪吃蛇',
      schulte: '舒尔特',
      breakout: '打砖块',
      sokoban: '推箱子',
    };

    function loadSaved() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') {
            const reset = {};
            for (const id of GAME_IDS) reset[id] = Number(saved.reset && saved.reset[id]) || 0;
            return {
              active: GAME_LABELS[saved.active] ? saved.active : '2048',
              '2048': saved['2048'] || null,
              tetris: saved.tetris || null,
              gomoku: saved.gomoku || null,
              klotski: saved.klotski || null,
              snake: saved.snake || null,
              schulte: saved.schulte || null,
              breakout: saved.breakout || null,
              sokoban: saved.sokoban || null,
              reset,
            };
          }
        }
      } catch (error) {
        // fall through
      }
      return {
        active: '2048',
        '2048': null,
        tetris: null,
        gomoku: null,
        klotski: null,
        snake: null,
        schulte: null,
        breakout: null,
        sokoban: null,
        reset: { '2048': 0, tetris: 0, gomoku: 0, klotski: 0, snake: 0, schulte: 0, breakout: 0, sokoban: 0 },
      };
    }

    function GameCard({ saved, setSaved, focused, setFocused, onCollapse }) {
      const active = GAME_LABELS[saved.active] ? saved.active : '2048';

      const updateGame = useCallback((game, next) => {
        setSaved((prev) => ({ ...prev, active: game, [game]: next }));
      }, [setSaved]);

      const switchTo = useCallback((game) => {
        if (game === active) return;
        setSaved((prev) => ({ ...prev, active: game }));
      }, [active, setSaved]);

      const restart = useCallback(() => {
        setSaved((prev) => {
          const reset = prev.reset || { '2048': 0, tetris: 0 };
          const next = {
            ...prev,
            reset: { ...reset, [active]: (Number(reset[active]) || 0) + 1 },
          };
          if (active === '2048') {
            next['2048'] = fresh2048State(prev['2048'] ? prev['2048'].best : 0);
          } else if (active === 'tetris') {
            next.tetris = freshTetrisState();
          } else if (active === 'gomoku') {
            next.gomoku = freshGomokuState();
          } else if (active === 'klotski') {
            next.klotski = freshKlotskiState();
          } else if (active === 'snake') {
            next.snake = { ...freshSnakeState(), best: prev.snake ? prev.snake.best : 0 };
          } else if (active === 'schulte') {
            next.schulte = freshSchulteState(prev.schulte ? prev.schulte.best : 0, prev.schulte ? prev.schulte.mode : undefined);
          } else if (active === 'breakout') {
            next.breakout = freshBreakoutState(prev.breakout ? prev.breakout.best : 0);
          } else {
            next.sokoban = freshSokobanState(prev.sokoban ? prev.sokoban.best : []);
          }
          return next;
        });
      }, [active, setSaved]);

      const title = GAME_LABELS[active];

      return h('div', {
        className: 'dshcg-root',
        style: cardStyle,
        tabIndex: 0,
        role: 'application',
        'aria-label': `${title} 游戏面板`,
        onFocus: () => setFocused(true),
        onBlur: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        },
        onMouseDown: (event) => {
          const tag = event.target && event.target.tagName;
          if (tag === 'SELECT' || tag === 'OPTION' || tag === 'INPUT' || tag === 'TEXTAREA') return;
          event.currentTarget.focus();
        },
      }, [
        h('style', { key: 'sidebar-css' }, SIDEBAR_HIDDEN_CSS),
        h('div', { key: 'head', style: headStyle }, [
          h('div', { key: 'picker', style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 } }, [
            h('span', {
              key: 'label',
              style: { fontSize: 10, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' },
            }, '游戏：'),
            h('select', {
              key: 'select',
              value: active,
              onChange: (event) => switchTo(event.target.value),
              style: {
                font: 'inherit',
                fontSize: 10,
                padding: '1px 2px',
                borderRadius: 5,
                border: '1px solid var(--dsw-alias-border-l1)',
                background: 'var(--dsw-alias-bg-layer-2)',
                color: 'var(--dsw-alias-label-primary)',
                maxWidth: 96,
              },
            }, GAME_IDS.map((id) => h('option', { key: id, value: id }, GAME_LABELS[id]))),
          ]),
          h('span', { key: 'spacer', style: { flex: 1 } }),
          h('button', {
            key: 'restart',
            type: 'button',
            style: iconButtonStyle,
            title: '重新开始',
            'aria-label': '重新开始',
            onClick: restart,
          }, '↻'),
          h('button', {
            key: 'collapse',
            type: 'button',
            style: iconButtonStyle,
            title: '最小化',
            'aria-label': '最小化',
            onClick: onCollapse,
          }, '−'),
        ]),
        h('div', {
          key: 'games',
          style: { display: 'grid', gridTemplateRows: `${GAME_BODY_H}px` },
        }, [
          { id: '2048', Comp: Game2048, initial: saved['2048'] },
          { id: 'tetris', Comp: GameTetris, initial: saved.tetris },
          { id: 'gomoku', Comp: GameGomoku, initial: saved.gomoku },
          { id: 'klotski', Comp: GameKlotski, initial: saved.klotski },
          { id: 'snake', Comp: GameSnake, initial: saved.snake },
          { id: 'schulte', Comp: GameSchulte, initial: saved.schulte },
          { id: 'breakout', Comp: GameBreakout, initial: saved.breakout },
          { id: 'sokoban', Comp: GameSokoban, initial: saved.sokoban },
        ].map((spec) => h('div', {
          key: `slot-${spec.id}`,
          style: {
            gridArea: '1 / 1',
            visibility: active === spec.id ? 'visible' : 'hidden',
            pointerEvents: active === spec.id ? 'auto' : 'none',
          },
        }, h(spec.Comp, {
          key: `${spec.id}-${(saved.reset && saved.reset[spec.id]) || 0}`,
          initial: spec.initial,
          onChange: (next) => updateGame(spec.id, next),
          focused,
          active: active === spec.id,
        })))),
      ]);
    }

    function GameShell() {
      const [saved, setSaved] = useState(loadSaved);
      const [collapsed, setCollapsed] = useState(false);
      const [focused, setFocused] = useState(false);
      const autoOpenedForRun = useRef(false);

      useEffect(() => {
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
        } catch (error) {
          // best-effort
        }
      }, [saved]);

      // Pop the card open once a long agent run is detected; the Host half
      // watches `agent/status` and serves /api/dsh-casual-games/status.
      useEffect(() => {
        let disposed = false;
        const poll = async () => {
          try {
            const response = await fetch('/api/dsh-casual-games/status', { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            if (disposed || !data) return;
            if (data.longRunning) {
              if (!autoOpenedForRun.current) {
                autoOpenedForRun.current = true;
                setCollapsed(false);
              }
            } else {
              autoOpenedForRun.current = false;
            }
          } catch (error) {
            // Host route unavailable (older host, offline): stay silent.
          }
        };
        const id = setInterval(poll, 2500);
        void poll();
        return () => {
          disposed = true;
          clearInterval(id);
        };
      }, []);

      if (collapsed) {
        return h('button', {
          className: 'dshcg-root',
          type: 'button',
          style: pillStyle,
          title: '展开游戏',
          'aria-label': '展开游戏',
          onClick: () => {
            setCollapsed(false);
            setFocused(false);
          },
        }, [
          h('style', { key: 'sidebar-css' }, SIDEBAR_HIDDEN_CSS),
          '2048',
        ]);
      }

      return h(GameCard, {
        saved,
        setSaved,
        focused,
        setFocused,
        onCollapse: () => setCollapsed(true),
      });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-casual-games',
          order: 60,
          label: '游戏',
        }, GameShell));
      },
      __components: { GameShell, GameCard, Game2048, GameTetris, GameGomoku, GameKlotski, GameSnake, GameSchulte, GameBreakout },
      __internals: {
        computeMove,
        boardFromTiles,
        tilesFromBoard,
        canMove,
        isBoard,
        spawnRandom,
        cellAt,
        rotateShape,
        getShape,
        pieceCells,
        collides,
        clearLines,
        emptyTetrisBoard,
        freshTetrisState,
        freshGomokuState,
        placeStone,
        gomokuWinAt,
        gomokuAiMove,
        gomokuPointScore,
        gomokuWouldWin,
        freshKlotskiState,
        klotskiCanMove,
        klotskiMove,
        pieceCellsAt,
        freshSnakeState,
        snakeStep,
        snakeFood,
        sanitizeGomoku,
        sanitizeKlotski,
        sanitizeSnake,
        freshSchulteState,
        schulteShuffle,
        schulteTap,
        schulteSlot,
        freshBreakoutState,
        breakoutStep,
        freshSokobanState,
        sokobanParse,
        sokobanMove,
        sokobanSolved: sokobanIsSolved,
        sokobanReset,
        sokobanNext,
        SOKOBAN_LEVELS,
      },
    };
  },
});
