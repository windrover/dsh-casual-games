#!/usr/bin/env node
/** Host-half smoke: agent/status -> /api/dsh-casual-games/status payload. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const hostPath = new URL('../index.js', import.meta.url);
const { apply, inject } = await import(hostPath.href);
assert.deepEqual([...inject], ['webServer']);

const listeners = new Map();
const routes = [];
const ctx = {
  on(name, fn) {
    listeners.set(name, fn);
    return () => {};
  },
  effect(fn) {
    const cleanup = fn();
    return typeof cleanup === 'function' ? cleanup : () => {};
  },
  webServer: {
    register(route) {
      routes.push(route);
      return () => {};
    },
  },
};

apply(ctx);
assert.equal(routes.length, 1);
const route = routes[0];
assert.equal(route.path, '/api/dsh-casual-games/status');

function call(method) {
  const captured = { status: 0, body: '', headers: {} };
  const res = {
    set statusCode(value) { captured.status = value; },
    setHeader(name, value) { captured.headers[name] = value; },
    end(body) { captured.body = body; },
  };
  route.handler({ method }, res);
  return { ...captured, json: JSON.parse(captured.body) };
}

let now = Date.now();
const realNow = Date.now;
Date.now = () => now;

const agent = { id: 'a' };
listeners.get('agent/status')({ agent, status: 'running' });
let payload = call('GET').json;
assert.equal(payload.running, 1);
assert.equal(payload.longRunning, false);

now += 4000;
payload = call('GET').json;
assert.equal(payload.running, 1);
assert.equal(payload.longRunning, true);
assert.ok(payload.longestMs >= 3500);

listeners.get('agent/status')({ agent, status: 'idle' });
payload = call('GET').json;
assert.equal(payload.running, 0);
assert.equal(payload.longRunning, false);

assert.equal(call('POST').status, 405);
Date.now = realNow;
console.log('host status route passed');
