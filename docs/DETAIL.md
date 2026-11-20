# dsh-casual-games — 侧栏小游戏

在 DeepSeek Harness 左侧栏底部常驻一张小游戏卡片，内置八款游戏，通过顶部「游戏：」下拉框切换。卡片固定在左下角空白区，不占用对话区域，刷新后自动出现。

## 游戏

| 游戏 | 说明 |
|---|---|
| 2048 | 4×4，方向键移动，合并动画与分数/最高分常显 |
| Tetris | 10×20，点击开始；分数/消行/等级在左侧栏纵向排列，下一块完整预览 |
| 五子棋 | 围棋式 15×15 交叉点；人机对战，难度 简单/普通/困难；黑子带高光 |
| 华容道 | 经典「横刀立马」；先选块，再点目标格或方向键；曹操移到底部中间通关 |
| 贪吃蛇 | 15×15，方向键/WASD，P 暂停，空格重开；分数/最高常显 |
| 舒尔特方格 | 按 1→25 点击，计时/最佳/进度常显；剩余数字每 4 秒重洗；可切换方形 / 圆形旋转棋盘（数字始终正立） |
| 推箱子 | 经典 100 关 Sokoban 关卡包；方向键/WASD 移动推箱，R 重置；箱子归位过关，自动进入下一关 |
| 打砖块 | 6 行 39 块错位砖；鼠标/触屏拖动或 ←→/A D 控制挡板，空格发球，P 暂停 |

## 安装

在 profile 目录安装本包，并把 `dsh-casual-games` 加入 `dsh.profile.bundles`：

```bash
cd ~/.dsh/profiles/<your-profile>
pnpm add github:windrover/dsh-casual-games
```

然后**完全退出并重新打开 DSH**。桌面客户端会缓存插件的 client 模块，仅刷新页面或禁用/启用插件不会加载新代码。

## 结构

```
dsh-casual-games/
  index.js            Host 半：监听 agent/status，提供 /api/dsh-casual-games/status
  client.js           全部游戏与 UI（单模块，注册到 shell.overlay）
  cordis.patch.yml    Loader patch（id: dsh-casual-games）
  locale/             中英文文案与插件市场元数据
  docs/DETAIL.md      本文件
  scripts/            离线校验脚本
```

## 长任务自动弹出

Host 半订阅 `agent/status` 与 `agent/disposed`，记录每个 agent 的连续运行时长，并通过 `GET /api/dsh-casual-games/status` 返回：

```json
{ "ok": true, "running": 1, "longestMs": 4200, "longRunning": true }
```

`longRunning` 阈值为 3500ms。Client 每 2.5 秒轮询；为真且卡片折叠时自动展开一次，本轮运行结束后重置；手动最小化后同一轮不会再次弹开。

> 客户端拿不到「当前会话」标识，因此判定的是 Host 上所有活跃 agent。

## 布局与状态

- 卡片 `position: fixed; left: 12px; bottom: 72px; width: 240px`，仅 1px 主题描边，无滚动条
- 七款游戏同时挂载，叠放在同一个 CSS Grid 单元里，卡片高度恒为 275px 游戏区，切换不跳动
- `GameShell` 是唯一状态源，持久化到 `localStorage['dsh.games.v2']`；各游戏挂载时自行 `sanitize`
- 隐藏的游戏暂停计时/重力/按键响应，避免后台运行

## 校验

```bash
npm test
node scripts/verify-games-logic.mjs   # 118 条纯逻辑断言（含推箱子 100 关完整性 + BFS 解一关）
node scripts/smoke-render.mjs         # 极简 hook runtime 渲染冒烟
node scripts/verify-host-status.mjs   # Host 状态路由
```
