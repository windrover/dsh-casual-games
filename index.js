/** Host half: reports whether any live agent has been running long enough. */

export const inject = ['webServer'];

const LONG_RUNNING_MS = 3500;

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  const { webServer } = ctx;
  const runningSince = new Map();

  ctx.effect(() => ctx.on('agent/status', (payload) => {
    if (!payload || !payload.agent) return;
    if (payload.status === 'running') {
      if (!runningSince.has(payload.agent)) runningSince.set(payload.agent, Date.now());
    } else {
      runningSince.delete(payload.agent);
    }
  }), 'dsh-casual-games: agent status');

  ctx.effect(() => ctx.on('agent/disposed', (payload) => {
    if (payload && payload.agent) runningSince.delete(payload.agent);
  }), 'dsh-casual-games: agent disposed');

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/dsh-casual-games/status',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' });
        return;
      }
      const now = Date.now();
      let longestMs = 0;
      for (const since of runningSince.values()) {
        const elapsed = now - since;
        if (elapsed > longestMs) longestMs = elapsed;
      }
      sendJson(res, 200, {
        ok: true,
        running: runningSince.size,
        longestMs,
        longRunning: runningSince.size > 0 && longestMs >= LONG_RUNNING_MS,
      });
    },
  }), 'dsh-casual-games: status route');
}
