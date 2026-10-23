import { spawn } from 'node:child_process';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ActivityMonitor, CONNECTION_MENU, MagpieClient, OWNER, PetClient, QUOTA_MENU,
  loopbackUrl, quotaSummary, requestJson,
} from './src/integration.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA = join(ROOT, 'data');
const LOGS = join(ROOT, 'logs');
const REPO_PET_ROOT = resolve(ROOT, '..', 'dsh-pet');
const PET_ROOT = existsSync(join(REPO_PET_ROOT, 'package.json'))
  ? REPO_PET_ROOT : join(ROOT, 'upstream', 'dsh-pet');
const RUNTIME = join(DATA, 'dsh-pet', 'standalone-runtime.json');
const LOCK = join(DATA, 'launcher.json');
const CONFIG = join(ROOT, 'config.json');
const command = process.argv[2] ?? 'start';
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
loopbackUrl(config.gateway);
for (const [name, minimum, maximum] of [
  ['petPort', 1024, 65510], ['pollMs', 500, 60000], ['quotaPollMs', 10000, 3600000],
  ['requestTimeoutMs', 500, 10000], ['chatTimeoutMs', 1000, 60000],
]) {
  if (!Number.isInteger(config[name]) || config[name] < minimum || config[name] > maximum) {
    throw new Error(`Invalid ${name} in config.json.`);
  }
}

async function readRuntime() {
  return JSON.parse(await readFile(RUNTIME, 'utf8'));
}

async function connectedPet(signal) {
  const runtime = await readRuntime();
  const pet = new PetClient(runtime, { timeoutMs: config.requestTimeoutMs, signal });
  const health = await pet.call('/health');
  if (health.name !== 'dsh-pet-standalone' || health.pluginRoot !== PET_ROOT || health.pid !== runtime.pid) {
    throw new Error('The local pet runtime does not belong to this installation.');
  }
  return pet;
}

function acquireLock() {
  mkdirSync(DATA, { recursive: true });
  try {
    const fd = openSync(LOCK, 'wx');
    writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    closeSync(fd);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(readFileSync(LOCK, 'utf8'));
    let alive = true;
    try { process.kill(previous.pid, 0); } catch (cause) {
      if (cause.code === 'ESRCH') alive = false;
      else throw cause;
    }
    if (alive) throw new Error('This Magpie pet is already running. Use STOP-MAGPIE-PET.cmd first.');
    unlinkSync(LOCK);
    return acquireLock();
  }
  return () => {
    try {
      if (JSON.parse(readFileSync(LOCK, 'utf8')).pid === process.pid) unlinkSync(LOCK);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
}

function initializePetConfig() {
  const directory = join(DATA, 'dsh-pet');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'main-config.jsonc');
  if (existsSync(path)) return;
  writeFileSync(path, `${JSON.stringify({
    trayEnabled: true,
    notificationsEnabled: false,
    font: { family: 'yahei', size: 28, followPet: false },
    workStatusTexts: [
      ['Magpie 正在准备回复'],
      ['Magpie 正在生成回复'],
      ['模型请求已结束'],
      ['Magpie 正在等待'],
      ['模型回复完成'],
      ['暂时读不到 Magpie 状态'],
    ],
    pets: [{
      id: 'main', name: '喜鹊搭子', size: 340, display: 'desktop',
      balanceEnabled: false, whisperEnabled: false, workStatusEnabled: true,
      fixedEnabled: true,
      position: { corner: 'bottom-right', marginX: 24, marginY: 24 },
      whisperPrompt: '你是住在主人桌面的喜鹊搭子。用自然亲切的中文简短回答，通常一到两句话。不要编造已经替主人操作过电脑。',
    }],
  }, null, 2)}\n`, { flag: 'wx' });
}

async function main() {
  const magpie = new MagpieClient(config.gateway, { timeoutMs: config.requestTimeoutMs });
  if (command === 'models') {
    console.log((await magpie.models()).map((model) => model.id).join('\n'));
    return;
  }
  if (command === 'status') {
    const hello = await magpie.verify();
    const pet = await connectedPet();
    const settings = await pet.call('/standalone-ai/settings');
    const state = await pet.call('/dsh-pet-7340/state');
    console.log(JSON.stringify({
      gateway: config.gateway, magpieVersion: hello.version, pet: pet.base,
      model: settings.model, chatEnabled: settings.enabled,
      automaticWhispers: settings.automaticWhispers,
      gatewayState: state.sections?.workStatus?.data ?? null,
    }, null, 2));
    return;
  }
  if (command === 'stop') {
    const pet = await connectedPet();
    await pet.call('/shutdown', 'POST');
    console.log('Magpie pet is stopping.');
    return;
  }
  if (command === 'quota') {
    const text = quotaSummary(await magpie.quotas());
    console.log(text);
    await connectedPet().then((pet) => pet.say(text));
    return;
  }
  if (command !== 'start') throw new Error(`Unknown command: ${command}`);
  if (!existsSync(join(PET_ROOT, 'lib', 'standalone.js'))) {
    throw new Error('Pet runtime has not been built. Run SETUP-MAGPIE-PET.ps1 first.');
  }
  const hello = await magpie.verify();
  const models = await magpie.models();
  // Establish the observability contract before starting a visible desktop window.
  await magpie.concurrency();
  const releaseLock = acquireLock();
  const abort = new AbortController();
  let pet;
  let child;
  let requestedStop = false;
  const stop = () => { requestedStop = true; abort.abort(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    initializePetConfig();
    mkdirSync(LOGS, { recursive: true });
    const logFd = openSync(join(LOGS, 'pet.log'), 'a');
    const env = { ...process.env, DSH_HOME: DATA, APPDATA: join(DATA, 'appdata') };
    delete env.ELECTRON_RUN_AS_NODE;
    if (config.electronPath) env.DSH_PET_ELECTRON_PATH = config.electronPath;
    child = spawn(process.execPath, [join(PET_ROOT, 'lib', 'standalone.js'), '--port', String(config.petPort)], {
      cwd: PET_ROOT, env, windowsHide: true, stdio: ['ignore', logFd, logFd],
    });
    closeSync(logFd);
    let childError;
    let childExited = false;
    const exited = new Promise((resolve) => {
      child.once('exit', (code) => { childExited = true; resolve(code); abort.abort(); });
      child.once('error', (error) => { childError = error; childExited = true; resolve(1); abort.abort(); });
    });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (childExited) throw childError ?? new Error('Pet runtime exited. See logs/pet.log.');
      try {
        const runtime = await readRuntime();
        if (runtime.pid === child.pid) {
          pet = await connectedPet(abort.signal);
          break;
        }
      } catch {}
      await delay(250, undefined, { signal: abort.signal });
    }
    if (!pet) throw new Error('Pet runtime did not become ready. See logs/pet.log.');
    const settings = await pet.call('/standalone-ai/settings');
    const keepSettings = settings.hasKey && settings.baseUrl === `${magpie.gateway}/v1`;
    const chatModel = keepSettings ? settings.model : config.model;
    if (!models.some((entry) => entry.id === chatModel)) {
      throw new Error('The chat model is not in Magpie. Run npm run models and update the AI settings.');
    }
    if (!keepSettings) {
      await pet.call('/standalone-ai/settings', 'POST', {
        protocol: 'openai-compatible', baseUrl: `${magpie.gateway}/v1`,
        model: config.model, apiKey: 'magpie-dsh-pet', enabled: true,
        automaticWhispers: false, maxTokens: 512, timeoutMs: config.chatTimeoutMs,
      });
    }
    await pet.registerMenu();
    console.log(`Magpie ${hello.version} connected. Pet: ${pet.base}`);
    console.log(`Chat model: ${(await pet.call('/standalone-ai/settings')).model}`);
    console.log('Right-click the pet to chat or choose More > Magpie quota.');
    const monitor = new ActivityMonitor(
      new MagpieClient(config.gateway, { timeoutMs: config.requestTimeoutMs, signal: abort.signal }),
      pet, { warn: console.warn },
    );
    let quotaText = 'Magpie 额度缓存正在读取。';
    const activityLoop = async () => {
      while (!abort.signal.aborted) {
        await monitor.tick();
        await delay(config.pollMs, undefined, { signal: abort.signal });
      }
    };
    const quotaLoop = async () => {
      while (!abort.signal.aborted) {
        try { quotaText = quotaSummary(await magpie.quotas()); } catch {
          quotaText = '暂时读不到 Magpie 额度缓存，请检查 Magpie 的用量页。';
        }
        await delay(config.quotaPollMs, undefined, { signal: abort.signal });
      }
    };
    const menuLoop = async () => {
      while (!abort.signal.aborted) {
        try {
          const events = await pet.menuEvents();
          for (const [label, petId] of Object.entries(events)) {
            if (typeof petId !== 'string') continue;
            if (label === QUOTA_MENU) await pet.say(quotaText, petId);
            else if (label === CONNECTION_MENU) {
              const current = await pet.call('/standalone-ai/settings');
              await pet.say(`Magpie 直连\n${config.gateway}\n聊天模型: ${current.model}`, petId);
            }
          }
        } catch {
          if (!abort.signal.aborted) await delay(1500, undefined, { signal: abort.signal });
        }
      }
    };
    const loops = [activityLoop(), quotaLoop(), menuLoop()];
    await Promise.race([
      exited,
      Promise.all(loops).catch((error) => { if (!abort.signal.aborted) throw error; }),
    ]);
    const wasRequestedStop = requestedStop;
    stop();
    await Promise.allSettled(loops);
    if (childError) throw childError;
    if (childExited && child.exitCode !== 0 && !wasRequestedStop) {
      throw new Error('Pet runtime stopped unexpectedly. See logs/pet.log.');
    }
  } finally {
    stop();
    if (pet) {
      const cleanup = new PetClient(await readRuntime().catch(() => ({
        port: config.petPort, token: pet.token,
      })));
      await cleanup.call(`/dsh-pet-7340/menu/item?owner=${OWNER}`, 'DELETE').catch(() => {});
      await cleanup.status({ state: null, task: null }).catch(() => {});
      await cleanup.call('/shutdown', 'POST').catch(() => {});
    }
    if (child && child.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        delay(5000),
      ]);
      if (child.exitCode === null) child.kill();
    }
    releaseLock();
  }
}

main().catch((error) => {
  if (error.name !== 'AbortError') console.error(error.message);
  process.exitCode = 1;
});
