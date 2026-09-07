const baseUrl = (process.env.WARMUP_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '');
export {};
const paths = [
  '/br', '/br/futebol', '/br/jogos/hoje', '/br/ao-vivo',
  '/mx', '/mx/futbol', '/mx/partidos/hoy', '/mx/en-vivo',
] as const;

const results = [];
for (const path of paths) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual', headers: { 'User-Agent': 'LivaSports-M3-Warmup' } });
    results.push({ path, status: response.status, durationMs: Math.round((performance.now() - started) * 10) / 10 });
  } catch {
    results.push({ path, status: 0, durationMs: Math.round((performance.now() - started) * 10) / 10 });
  }
}

const passed = results.every(result => result.status >= 200 && result.status < 400);
console.info(JSON.stringify({ command: 'cache-warmup', passed, results }));
if (!passed) process.exitCode = 1;
