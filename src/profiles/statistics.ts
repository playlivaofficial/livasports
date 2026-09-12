export function persistedStatistic(value: unknown, codes: readonly string[], keys: readonly string[] = ['total','value','average']): number | null {
  if (!value || typeof value !== 'object') return null;
  const statistics = value as Record<string, unknown>;
  for (const code of codes) {
    const raw = statistics[code];
    if (!raw || typeof raw !== 'object') continue;
    for (const key of keys) {
      const candidate = (raw as Record<string, unknown>)[key];
      if ((typeof candidate === 'number' || typeof candidate === 'string') && candidate !== '' && Number.isFinite(Number(candidate))) {
        return Number(candidate);
      }
    }
  }
  return null;
}
