import type {ProfileStatistic} from './types';

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

/** Sportmonks team totals use all.count; player totals use total. Missing values stay unknown. */
export function seasonStatisticValue(value:unknown,key:string):number|null{
  if(!value||typeof value!=='object')return null;
  const raw=(value as Record<string,unknown>)[key];
  const selected=key==='all'&&raw&&typeof raw==='object'?(raw as Record<string,unknown>).count:raw;
  if((typeof selected!=='number'&&typeof selected!=='string')||selected==='')return null;
  const number=Number(selected);return Number.isFinite(number)?number:null;
}
/** The profile summary must describe one season and team, even when only a few metrics exist. */
export function primaryProfileStatistics(rows:ProfileStatistic[]):ProfileStatistic[]{
  const first=rows[0];if(!first)return [];
  return rows.filter(r=>r.competitionId===first.competitionId&&r.seasonId===first.seasonId&&(r.teamId??r.sourceTeamKey)===(first.teamId??first.sourceTeamKey)).slice(0,4);
}
