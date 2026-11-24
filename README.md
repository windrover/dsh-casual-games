# dsh-casual-games

Eight tiny games docked at the bottom-left of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) sidebar. One compact card, one dropdown, no window juggling.

## Games

| Game | Controls |
|---|---|
| **2048** | Arrow keys. Score / best are always visible; slide, merge and spawn are animated. |
| **Tetris** | Click the board to start. `←` `→` move, `↑` / `X` rotate, `↓` soft drop, `Space` hard drop, `P` pause. Leaving the tab pauses the run. |
| **Gomoku** | Go-style 15×15 intersection board. You play black against the computer; difficulty `Simple / Normal / Hard` (simple is a pure beginner: random empty cell, deliberately away from your stones, never blocks or takes a win on purpose). |
| **Klotski** | Select a block, then click a target cell or use arrow keys. Put Cao Cao on the bottom-centre exit to win. |
| **Snake** | Arrow keys / `WASD`, `P` pause, `Space` restart. |
| **Schulte table** | Tap 1→25 in order. Progress / time / best are shown; the remaining numbers reshuffle every 4 s. The board can be a square grid or a rotating circle (numbers stay upright). |
| **Sokoban** | Classic 100-level Sokoban pack (16×16 XSB-style maps). Arrow keys / `WASD` walk and push, `R` resets the level; press `Enter` after clearing a level to advance (the overlay button still works). |
| **Breakout** | Drag the paddle with the mouse/touch (pointer capture keeps it following outside the field), or hold `←` `→` / `A` `D`. `Space` serves, `P` pauses. Six staggered rows of bricks. |

## Install

Inside a DSH profile directory:

```bash
cd ~/.dsh/profiles/<your-profile>
pnpm add github:windrover/dsh-casual-games
```

Then add `dsh-casual-games` to `dsh.profile.bundles` in that profile's `package.json` (or install it through DSH's plugin manager), and **fully restart DSH** — the desktop client caches plugin client modules.

## Automatic pop-up during long agent runs

The status route enforces the Host connection gate (`ctx.connection.admit` / `requestRejection`) on every request, so a web page in the browser cannot read it without a DSH session.

The card (and its collapsed pill) is hidden via CSS while the shell marks the sidebar collapsed (`[data-sidebar-collapsed]`).

The Host half listens to `agent/status` and serves `GET /api/dsh-casual-games/status` with `{ running, longestMs, longRunning }`. When any agent has been running for more than 3.5 s, the client expands the card once; it resets after the run finishes, and a manual minimize is respected.

## Keyboard handling

Games watch `keydown` on `window` while the card is focused, but every handler returns early when `document.activeElement` is an input, textarea, select or contenteditable — typing in the composer always keeps its arrow keys.

## Architecture

- Single client module (`client.js`) registered into `shell.overlay`; the card is fixed at `left: 12px; bottom: 72px`, width 240 px, border-only, no scrollbars.
- All games stay mounted in one CSS grid cell, so the card height never jumps between games.
- State lives in `GameShell` and is persisted to `localStorage['dsh.games.v2']`; each game sanitizes its saved state on mount.
- Shared host state is served by the tiny `index.js` route above.

## Development

```bash
npm test
# or individually
node scripts/verify-games-logic.mjs   # 119 pure-logic assertions across all games (incl. Sokoban pack validation + one BFS solve)
node scripts/smoke-render.mjs         # renders components with a minimal hook runtime
node scripts/verify-host-status.mjs   # host route: running / longRunning / idle / 405
```

## License

MIT © 2026 windrover
