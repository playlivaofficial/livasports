import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

for (const file of ['.env.production.local', '.env']) {
  const content = await readFile(file, 'utf8').catch(() => '');
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    process.env[match[1]] = value;
  }
}
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', process.argv[2] ?? '3300'], {
  stdio: 'inherit', env: process.env, windowsHide: true,
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 0)));
