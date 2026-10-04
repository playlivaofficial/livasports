import type {InterfaceLocale} from '@/localization/interface';
import type {TeamProfileView} from '@/profiles/types';
import {loadTeamHistory} from './runtime';
import {TeamHistoryBrowser} from './TeamHistoryBrowser';

/** Query-independent default history is crawlable; query controls are a client island. */
export async function TeamHistoryPanel({profile,locale}:{profile:TeamProfileView;locale:InterfaceLocale}){
  // Throw on a database error so ISR retains its last successful snapshot instead
  // of replacing a healthy public page with an hour-long unavailable state.
  const history=await loadTeamHistory(profile.publicId,locale,'results',1,undefined,3600);
  return <TeamHistoryBrowser locale={locale} profile={{publicId:profile.publicId,name:profile.name,competitions:profile.competitions}} initial={history}/>;
}
