import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PetClient } from './integration.mjs';
import { isProcessRunning } from './process-state.mjs';

export function petSourceRoot(root) {
  const sibling = resolve(root, '..', 'dsh-pet');
  return existsSync(join(sibling, 'package.json')) ? sibling : join(root, 'upstream', 'dsh-pet');
}

async function readJson(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The saved launch state is invalid. Check the files in data/.');
  }
}

function startCompanion(root, nodePath) {
  const logs = join(root, 'logs');
  mkdirSync(logs, { recursive: true });
  const output = openSync(join(logs, 'companion.log'), 'a');
  let errors;
  try {
    errors = openSync(join(logs, 'companion-error.log'), 'a');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(nodePath, [join(root, 'app.mjs')], {
      cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', output, errors],
    });
    child.unref();
    return child;
  } finally {
    closeSync(output);
    if (errors !== undefined) closeSync(errors);
  }
}

export async function showDesktopPet(pet) {
  const config = await pet.call('/dsh-pet-7340/config');
  const pets = Object.values(config).flatMap((entry) => Array.isArray(entry?.pets) ? entry.pets : []);
  const visible = pets.find((entry) => entry.display === 'desktop' || entry.display === 'both');
  if (visible) return { id: visible.id, restoredDesktop: false };
  const first = config.main?.pets?.[0] ?? pets[0];
  if (!first?.id || !['web', 'none'].includes(first.display)) {
    throw new Error('No desktop pet is configured. Check data/dsh-pet/main-config.jsonc.');
  }
  await pet.call('/dsh-pet-7340/pet-display', 'POST', {
    id: first.id, display: first.display === 'web' ? 'both' : 'desktop',
  });
  return { id: first.id, restoredDesktop: true };
}

/** An explicit shortcut launch starts the companion or restores its hidden desktop pet. */
export async function launchPet({
  root, nodePath, timeoutMs = 35000, pollMs = 200,
  start = startCompanion, isAlive = isProcessRunning,
}) {
  const runtimeFile = join(root, 'data', 'dsh-pet', 'standalone-runtime.json');
  const expectedSource = petSourceRoot(root);
  const deadline = Date.now() + timeoutMs;
  const discover = async () => {
    try {
      const runtime = await readJson(runtimeFile);
      if (!runtime || runtime.pluginRoot !== expectedSource) return undefined;
      const pet = new PetClient(runtime, { timeoutMs: Math.min(timeoutMs, 1000) });
      const health = await pet.call('/health');
      if (health.name !== 'dsh-pet-standalone' ||
          health.pluginRoot !== expectedSource || health.pid !== runtime.pid) return undefined;
      return pet;
    } catch {
      return undefined;
    }
  };
  const lock = await readJson(join(root, 'data', 'launcher.json'));
  const running = lock && isAlive(lock.pid);
  let pet = await discover();
  // A surviving standalone server without its companion must release its port before a restart.
  if (pet && !running) {
    await pet.call('/shutdown', 'POST');
    while (await discover()) {
      if (Date.now() >= deadline) throw new Error('The previous pet service could not stop.');
      await delay(pollMs);
    }
    pet = undefined;
  }
  let child;
  let spawnError;
  if (!running) {
    child = start(root, nodePath);
    child.once('error', (error) => { spawnError = error; });
  }
  while (!pet) {
    if (spawnError || (child && child.exitCode !== null)) {
      throw new Error('The Magpie companion could not start. Check Magpie and logs/companion-error.log.');
    }
    if (Date.now() >= deadline) {
      throw new Error('The pet service did not become ready. Check logs/companion-error.log and logs/pet.log.');
    }
    pet = await discover();
    if (!pet) await delay(pollMs);
  }
  const desktop = await showDesktopPet(pet);
  while (Date.now() < deadline) {
    try {
      const pose = await pet.call(`/dsh-pet-7340/pose?pet=${encodeURIComponent(desktop.id)}`);
      if (pose.ok && pose.petId === desktop.id && Number.isFinite(pose.x) && Number.isFinite(pose.y)) {
        return { reused: Boolean(running), ...desktop };
      }
    } catch {
      // The host starts its native helper asynchronously after a display change.
    }
    await delay(pollMs);
  }
  throw new Error('The pet service is running, but its desktop window is not ready. Check logs/pet.log.');
}
