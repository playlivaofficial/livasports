type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value&&typeof value==='object'?value as Row:{};
const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter((r):r is Row=>!!r&&typeof r==='object'):[];

/** A coach must reference a participant in this fixture, not another team in the import batch. */
export function fixtureCoachSources(fixture:Row){
  const participants=new Set(rows(fixture.participants).map(p=>String(p.id)));
  const accepted:Row[]=[],rejected:Row[]=[];
  for(const coach of rows(fixture.coaches)){
    const participant=coach.participant_id??object(coach.meta).participant_id;
    (participant!==undefined&&participants.has(String(participant))?accepted:rejected).push(coach);
  }
  return {accepted,rejected};
}

export function fixtureFormationSources(fixture:Row){
  const participants=new Set(rows(fixture.participants).map(p=>String(p.id)));
  const accepted:Row[]=[],rejected:Row[]=[];
  for(const formation of rows(fixture.formations)){
    if(typeof formation.formation!=='string'||!formation.formation.trim())continue;
    (formation.participant_id!==undefined&&participants.has(String(formation.participant_id))?accepted:rejected).push(formation);
  }
  return {accepted,rejected};
}

/** A lineup cannot be assigned to a different club simply because it appears in the same batch. */
export function fixtureLineupSources(fixture:Row){
  const participants=new Set(rows(fixture.participants).map(p=>String(p.id)));
  const accepted:Row[]=[],rejected:Row[]=[];
  for(const lineup of rows(fixture.lineups)){
    (lineup.team_id!==undefined&&participants.has(String(lineup.team_id))?accepted:rejected).push(lineup);
  }
  return {accepted,rejected};
}
