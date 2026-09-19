export function isPregameActionable(kickoff: string | Date, now = new Date()): boolean {
  return new Date(kickoff).getTime() > now.getTime();
}

export function canonicalSelectionKey(input: { fixtureId: string; period: string; market: string; outcome: string; line: number | null; settlementScope: string }): string {
  return [input.fixtureId,input.period,input.market,input.outcome,input.line === null ? 'NO_LINE' : input.line.toFixed(3),input.settlementScope].join('|');
}

export function eventMinute(minute: number | null, extraMinute: number | null): string {
  return minute === null ? '—' : `${minute}${extraMinute ? `+${extraMinute}` : ''}’`;
}

const isShootout = (type:string) => type === 'Penalty Shootout Goal' || type === 'Penalty Shootout Miss';
/** Shootout attempt numbers are not regulation minutes. Preserve source order within each phase. */
export function orderedMatchEvents<T extends {type:string}>(events:readonly T[]):T[] {
  return [...events.filter(event=>!isShootout(event.type)),...events.filter(event=>isShootout(event.type))];
}
export function eventTiming(event:{type:string;minute:number|null;extraMinute:number|null}):string {
  return isShootout(event.type) ? (event.minute===null?'—':`#${event.minute}`) : eventMinute(event.minute,event.extraMinute);
}

export function numericOrMissing(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isLiveSnapshotStale(status: string, providerUpdatedAt: string | null, now = new Date(), thresholdSeconds = 90): boolean {
  if (status !== 'LIVE' && status !== 'HALFTIME') return false;
  if (!providerUpdatedAt) return true;
  const updatedAt = new Date(providerUpdatedAt).getTime();
  return !Number.isFinite(updatedAt) || now.getTime() - updatedAt > thresholdSeconds * 1000;
}

export function latestSnapshotAt(values: readonly (string | null)[]): string | null {
  return values.reduce<string | null>((latest,value) => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return latest;
    return !latest || new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  },null);
}
