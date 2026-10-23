import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchPet, petSourceRoot, showDesktopPet } from '../src/launcher.mjs';
import { isProcessRunning } from '../src/process-state.mjs';

test('process discovery recognizes the current process and rejects dead or invalid PIDs', () => {
  assert.equal(isProcessRunning(process.pid), true);
  for (const pid of [0, -1, '123', undefined, NaN, 0x7fffffff]) {
    assert.equal(isProcessRunning(pid), false);
  }
});

async function fixture(t, { display = 'web', healthy = true, poseReady = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'magpie launcher '));
  const state = {
    healthy, poseReady, calls: [], starts: 0, poseReads: 0,
    config: {
      main: {
        font: { family: 'youyuan', size: 23, followPet: true },
        trayEnabled: true,
        pets: [
          { id: 'main', display, name: 'Keep name', whisperPrompt: 'Keep personality' },
          { id: 'second', display: 'none', name: 'Keep hidden' },
        ],
      },
    },
  };
  await mkdir(join(root, 'data', 'dsh-pet'), { recursive: true });
  await writeFile(join(root, 'data', 'launcher.json'), JSON.stringify({ pid: process.pid }));
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    state.calls.push({ path: req.url, method: req.method, body });
    assert.equal(req.headers['x-dsh-pet-token'], 'a'.repeat(43));
    let result;
    let status = 200;
    if (req.url === '/health') {
      if (!state.healthy) status = 503;
      result = { name: 'dsh-pet-standalone', pid: process.pid, pluginRoot: petSourceRoot(root) };
    } else if (req.url === '/shutdown') {
      state.healthy = false;
      result = { ok: true };
    } else if (req.url === '/dsh-pet-7340/config') {
      result = state.config;
    } else if (req.url === '/dsh-pet-7340/pet-display') {
      const pet = state.config.main.pets.find((entry) => entry.id === body.id);
      pet.display = body.display;
      result = state.config;
    } else if (req.url.startsWith('/dsh-pet-7340/pose?')) {
      state.poseReads += 1;
      result = state.poseReady
        ? { ok: true, petId: 'main', x: 0.9, y: 0.9 }
        : { ok: false, reason: 'pose-unavailable' };
    } else {
      status = 404;
      result = {};
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const runtimeFile = join(root, 'data', 'dsh-pet', 'standalone-runtime.json');
  await writeFile(runtimeFile, JSON.stringify({
    port: server.address().port, token: 'a'.repeat(43), pid: process.pid, pluginRoot: petSourceRoot(root),
  }));
  const options = {
    root, nodePath: process.execPath, timeoutMs: 1200, pollMs: 10,
    isAlive: () => true,
    start: () => {
      state.starts += 1;
      state.healthy = true;
      return Object.assign(new EventEmitter(), { exitCode: null });
    },
  };
  return { root, state, options, runtimeFile };
}

test('reopening a hidden pet restores the desktop, preserving font, personality and other pets', async (t) => {
  const { state, options } = await fixture(t);
  const original = structuredClone(state.config);
  const result = await launchPet(options);
  assert.deepEqual(result, { reused: true, id: 'main', restoredDesktop: true });
  original.main.pets[0].display = 'both';
  assert.deepEqual(state.config, original);
  assert.equal(state.starts, 0);
  assert.deepEqual(state.calls.filter((call) => call.method === 'POST'), [{
    path: '/dsh-pet-7340/pet-display', method: 'POST', body: { id: 'main', display: 'both' },
  }]);
  assert(state.poseReads > 0);
});

test('a second launch reuses a visible pet without rewriting its settings', async (t) => {
  const { state, options } = await fixture(t, { display: 'desktop' });
  const first = await launchPet(options);
  const second = await launchPet(options);
  assert.equal(first.reused, true);
  assert.deepEqual(first, second);
  assert.equal(state.starts, 0);
  assert.equal(state.calls.filter((call) => call.method !== 'GET').length, 0);
});

test('a dead launcher and stale runtime trigger one cold start', async (t) => {
  const { state, options } = await fixture(t, { healthy: false, display: 'desktop' });
  const result = await launchPet({ ...options, isAlive: () => false });
  assert.equal(result.reused, false);
  assert.equal(state.starts, 1);
});

test('an orphaned owned service is shut down before restarting its companion', async (t) => {
  const { state, options } = await fixture(t, { display: 'desktop' });
  await launchPet({ ...options, isAlive: () => false });
  assert.equal(state.starts, 1);
  assert.equal(state.calls.filter((call) => call.path === '/shutdown').length, 1);
});

test('a foreign runtime is never reconfigured or shut down', async (t) => {
  const { options, state, runtimeFile } = await fixture(t);
  const runtime = JSON.parse(await readFile(runtimeFile, 'utf8'));
  runtime.pluginRoot = join(options.root, 'someone-else');
  await writeFile(runtimeFile, JSON.stringify(runtime));
  await assert.rejects(launchPet({ ...options, timeoutMs: 80 }), /did not become ready/);
  assert.deepEqual(state.calls, []);
  assert.equal(state.starts, 0);
});

test('a failed companion launch reports a useful startup error', async (t) => {
  const { options } = await fixture(t, { healthy: false });
  await assert.rejects(launchPet({
    ...options, isAlive: () => false,
    start: () => Object.assign(new EventEmitter(), { exitCode: 1 }),
  }), /Check Magpie.*companion-error/);
});

test('HTTP readiness alone is insufficient when the native renderer never reports', async (t) => {
  const { options, state } = await fixture(t, { display: 'desktop', poseReady: false });
  await assert.rejects(launchPet({ ...options, timeoutMs: 100 }), /desktop window is not ready/);
  assert(state.poseReads > 0);
  assert.equal(state.starts, 0);
});

test('restoring a fully hidden pet enables only its desktop surface', async () => {
  const writes = [];
  const pet = {
    call: async (path, method, body) => {
      if (method === 'POST') { writes.push(body); return {}; }
      return { main: { pets: [{ id: 'main', display: 'none' }] } };
    },
  };
  assert.deepEqual(await showDesktopPet(pet), { id: 'main', restoredDesktop: true });
  assert.deepEqual(writes, [{ id: 'main', display: 'desktop' }]);
});
