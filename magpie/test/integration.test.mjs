import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  ActivityMonitor, MagpieClient, PetClient, gatewayActivity, loopbackUrl,
  quotaSummary, requestJson,
} from '../src/integration.mjs';

async function fixture(t, handler) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = {
      path: req.url, method: req.method, headers: req.headers,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined,
    };
    calls.push(input);
    const result = await handler(input);
    res.writeHead(result.status ?? 200, {
      'content-type': 'application/json', ...result.headers,
    });
    res.end(result.status === 204 ? undefined : JSON.stringify(result.body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, port: server.address().port, calls };
}

const busy = (extra = {}) => ({
  requests: 1, waiting: 0, tools: 0,
  active: [{ id: 7, agent: 'test-agent', model: 'group/cheap-first', phase: 'upstream', ms: 5500 }],
  ...extra,
});
const idle = () => busy({ requests: 0, active: [] });

test('gateway discovery, catalog and observability use local read-only endpoints', async (t) => {
  const service = await fixture(t, ({ path }) => ({
    body: {
      '/api/hello': { name: 'magpie', version: 'test' },
      '/v1/models': { data: [{ id: 'group/cheap-first' }] },
      '/v1/magpie/concurrency': busy(),
      '/v1/magpie/quotas?kept=1': { data: [{ provider: 'test', windows: [] }] },
    }[path],
  }));
  const magpie = new MagpieClient(service.origin);
  assert.equal((await magpie.verify()).version, 'test');
  assert.equal((await magpie.models())[0].id, 'group/cheap-first');
  assert.equal((await magpie.concurrency()).requests, 1);
  assert.equal((await magpie.quotas())[0].provider, 'test');
  assert(service.calls.every((call) => call.method === 'GET' && !call.body));
  assert(service.calls.every((call) => call.headers.authorization === 'Bearer magpie-dsh-pet'));
});

test('refuses remote endpoints and credential-bearing gateway URLs', () => {
  for (const url of [
    'https://127.0.0.1:3425', 'http://192.168.1.1:3425', 'http://example.com',
    'http://u:p@localhost:3425', 'http://localhost:3425/?key=private',
    'http://localhost:3425/#private', 'http://localhost:3425/v1',
  ]) assert.throws(() => loopbackUrl(url));
  assert.equal(loopbackUrl('http://127.0.0.1:3425/'), 'http://127.0.0.1:3425');
});

test('invalid observability data is never interpreted as an idle gateway', async (t) => {
  for (const value of [{}, { ...idle(), requests: -1 }, { ...idle(), active: [null] }]) {
    const service = await fixture(t, () => ({ body: value }));
    await assert.rejects(new MagpieClient(service.origin).concurrency(), /Invalid/);
  }
});

test('gateway counts generate busy, queued and tool-wait states', () => {
  assert.deepEqual(gatewayActivity(idle()), { state: null, task: null });
  assert.equal(gatewayActivity(busy()).state, 'working');
  assert.match(gatewayActivity(busy()).task, /5 秒/);
  assert.equal(gatewayActivity(busy({ waiting: 1 })).state, 'waiting');
  assert.equal(gatewayActivity(busy({
    active: [{ model: 'm', phase: 'rpm', ms: 1 }],
  })).state, 'waiting');
  assert.equal(gatewayActivity(idle()).state, null);
  assert.equal(gatewayActivity({ ...idle(), tools: 1 }).state, 'waiting');
  assert.equal(gatewayActivity(busy({
    requests: 2, waiting: 1, active: [{ phase: 'slot' }, { phase: 'upstream' }],
  })).state, 'working');
});

test('pet chat does not cover its own reply with a busy bubble', () => {
  assert.equal(gatewayActivity(busy({ active: [{ agent: 'dsh-pet' }] })).state, null);
  assert.equal(gatewayActivity(busy({
    requests: 2, active: [{ agent: 'dsh-pet' }, { agent: 'another', model: 'model' }],
  })).state, 'working');
});

test('monitor handles concurrent work, idle, connection failure and recovery without claiming success', async () => {
  let value = busy();
  const updates = [];
  const warnings = [];
  const monitor = new ActivityMonitor({
    async concurrency() {
      if (value instanceof Error) throw value;
      return value;
    },
  }, { async status(activity) { updates.push(activity); } }, {
    warn: (warning) => warnings.push(warning),
  });
  await monitor.tick();
  value = busy({ requests: 2 });
  await monitor.tick();
  value = idle();
  await monitor.tick();
  value = new Error('private upstream details');
  await monitor.tick();
  await monitor.tick();
  value = busy();
  await monitor.tick();
  assert.deepEqual(updates.map((entry) => entry.state), ['working', 'working', null, 'error', 'working']);
  assert.equal(warnings.length, 1);
  assert(!JSON.stringify(updates).includes('private'));
  assert(!updates.some((entry) => entry.state === 'success'));
});

test('does not clear another startup status while idle, throttles elapsed updates, retries failed writes', async () => {
  let value = idle();
  let now = 1000;
  let failing = false;
  const updates = [];
  const monitor = new ActivityMonitor({
    async concurrency() { return value; },
  }, {
    async status(activity) {
      if (failing) throw new Error('pet offline');
      updates.push(activity);
    },
  }, { now: () => now });
  await monitor.tick();
  assert.equal(updates.length, 0);
  value = busy();
  failing = true;
  await monitor.tick();
  failing = false;
  await monitor.tick();
  now += 1000;
  value = busy({ active: [{ model: 'group/cheap-first', ms: 6500 }] });
  await monitor.tick();
  assert.equal(updates.length, 1);
  now += 16000;
  await monitor.tick();
  assert.equal(updates.length, 2);
  value = idle();
  await monitor.tick();
  assert.equal(updates.at(-1).state, null);
});

test('quota display uses genuine percentages, labels stale cache, and excludes account identities', () => {
  const text = quotaSummary([{
    provider: 'vendor', user: 'private@example.test', name: 'private@example.test',
    last: true, readAt: '2026-10-23T08:00:00Z',
    windows: [{ name: '5h', used: 87.6 }, { name: '7d', used: 25 }, { used: NaN }],
  }], Date.parse('2026-10-23T10:00:00Z'));
  assert.match(text, /88%/);
  assert.match(text, /25%/);
  assert.match(text, /2 小时前/);
  assert.match(text, /缓存/);
  assert(!text.includes('@'));
  assert(!text.includes('NaN'));
  assert.match(quotaSummary([]), /暂无/);
  assert.match(quotaSummary([null]), /格式/);
});

test('pet writes include capability, desktop surface and a real lease', async (t) => {
  const service = await fixture(t, ({ path }) => ({
    status: path.endsWith('/work-status') ? 204 : 200,
    body: path.includes('/lock?') ? { ok: true, lockId: 'lease-1' } : { ok: true },
  }));
  const pet = new PetClient({ port: service.port, token: 'a'.repeat(43) });
  await pet.say('quota text', 'main');
  await pet.status({ state: null, task: null });
  assert(service.calls[0].path.includes('surface=desktop'));
  assert(service.calls[1].path.includes('lock=lease-1'));
  assert.equal(service.calls[1].body.text, 'quota text');
  assert.equal(service.calls[1].body.anim, false);
  assert(service.calls.every((call) => call.headers['x-dsh-pet-token'] === 'a'.repeat(43)));
  assert.equal(service.calls.at(-1).method, 'DELETE');
});

test('menu long polling unwraps the upstream events envelope', async (t) => {
  const service = await fixture(t, () => ({
    body: { ok: true, events: { '查看 Magpie 额度': 'main', '查看 Magpie 连接': null } },
  }));
  const pet = new PetClient({ port: service.port, token: 'd'.repeat(43) });
  assert.deepEqual(await pet.menuEvents(), {
    '查看 Magpie 额度': 'main', '查看 Magpie 连接': null,
  });
  assert.equal(service.calls[0].path, '/dsh-pet-7340/menu/events?owner=Magpie&wait=5000');
});

test('a refused lease never broadcasts; failed broadcast releases only its own lease', async (t) => {
  const refused = await fixture(t, () => ({ body: { ok: false, reason: 'locked' } }));
  const lockedPet = new PetClient({ port: refused.port, token: 'b'.repeat(43) });
  await assert.rejects(lockedPet.say('x'), /locked/);
  assert.equal(refused.calls.length, 1);
  const failed = await fixture(t, ({ path }) => ({
    body: path.includes('/lock?') ? { ok: true, lockId: 'lease-2' }
      : path.includes('/broadcast?') ? { ok: false, reason: 'lock-lost' } : { ok: true },
  }));
  const pet = new PetClient({ port: failed.port, token: 'c'.repeat(43) });
  await assert.rejects(pet.say('x'), /lock-lost/);
  assert.deepEqual(failed.calls.at(-1).body, { lockId: 'lease-2' });
  assert(!JSON.stringify(failed.calls.at(-1).body).includes('force'));
});

test('HTTP errors do not expose server bodies or follow redirects', async (t) => {
  const denied = await fixture(t, () => ({ status: 403, body: { error: 'private credential' } }));
  await assert.rejects(requestJson(denied.origin), (error) =>
    error.message.includes('403') && !error.message.includes('private'));
  const redirect = await fixture(t, () => ({
    status: 302, headers: { location: 'http://example.test/' }, body: {},
  }));
  await assert.rejects(requestJson(redirect.origin));
});
