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

  // Every request must pass the Host's own connection gate (the same check
  // DSH's API uses). Without it, any web page open in the user's browser could
  // read this status endpoint. `connection` is read per request because the
  // composition may publish it after plugins load; older hosts expose the
  // decision as `requestRejection`, newer ones as `admit`.
  const rejectRequest = (req) => {
    let connection;
    try {
      connection = ctx.get('connection');
    } catch (error) {
      connection = undefined;
    }
    if (!connection) return undefined;
    try {
      if (typeof connection.admit === 'function') {
        const admission = connection.admit(req);
        const status = admission && typeof admission === 'object' ? admission.rejection : undefined;
        return typeof status === 'number' ? status : undefined;
      }
      if (typeof connection.requestRejection === 'function') {
        const status = connection.requestRejection(req);
        return typeof status === 'number' ? status : undefined;
      }
    } catch (error) {
      return 503;
    }
    return undefined;
  };

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
      const rejection = rejectRequest(req);
      if (rejection !== undefined) {
        sendJson(res, rejection, { ok: false, error: 'request rejected' });
        return;
      }
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
