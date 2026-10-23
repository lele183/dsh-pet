import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export function isProcessRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffffffff) return false;
  if (process.platform === 'win32') {
    // A zero-signal probe can return EPERM for a stale PID on Windows.
    const output = execFileSync(
      join(process.env.SystemRoot, 'System32', 'tasklist.exe'),
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 },
    );
    return output.split(/\r?\n/).some((line) => {
      const row = /^"(?:[^"]|"")*","(\d+)"/.exec(line);
      return row && Number(row[1]) === pid;
    });
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}
