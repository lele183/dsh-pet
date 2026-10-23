const { app, dialog } = require('electron');
const { appendFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = __dirname;
const logs = join(root, 'logs');
const data = join(root, 'data', 'launcher-ui');
mkdirSync(data, { recursive: true });
mkdirSync(logs, { recursive: true });
app.setName('Magpie Pet Launcher');
app.setPath('userData', data);
app.setAppUserModelId('lele183.magpie-pet.launcher');
app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      const nodeIndex = process.argv.indexOf('--node-path');
      const nodePath = nodeIndex >= 0 ? process.argv[nodeIndex + 1] : undefined;
      if (!nodePath) throw new Error('The Node.js path is missing. Run CREATE-SHORTCUT.ps1 again.');
      const { launchPet } = await import('./src/launcher.mjs');
      const result = await launchPet({ root, nodePath });
      appendFileSync(join(logs, 'launcher.log'), JSON.stringify({ time: new Date().toISOString(), ...result }) + '\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The pet could not start.';
      appendFileSync(join(logs, 'launcher-error.log'), `${new Date().toISOString()} ${message}\n`);
      dialog.showErrorBox('Magpie 桌宠启动失败', `${message}\n\n日志目录：${logs}`);
    } finally {
      app.quit();
    }
  });
}
