import {expect,it} from 'vitest';
import {unlinkedScorers,unlinkedStanding,unlinkedTeamLabel} from './unlinked-competition';
it('preserves player goals and explicit missing team without fabricating a profile',()=>{
 const rows=[{provider_record_id:1,provider_player_id:2,provider_participant_id:3,player_public_id:'known-player',player_name:'Official player',payload:{type_id:208,total:2}},{provider_record_id:4,provider_player_id:2,provider_participant_id:3,payload:{type_id:209,total:0}}];
 expect(unlinkedScorers(rows,'en')).toEqual([{publicId:'known-player',sourceKey:'unlinked-scorer:1',name:'Official player',team:null,goals:2,assists:0,appearances:null,minutes:null,rank:0}]);
});
it('does not fabricate a global player ID or silently merge different teams',()=>{
 const rows=[{provider_record_id:1,provider_player_id:2,provider_participant_id:3,payload:{type_id:208,total:1}},{provider_record_id:4,provider_player_id:2,provider_participant_id:5,payload:{type_id:208,total:2}}];
 const result=unlinkedScorers(rows,'br');expect(result).toHaveLength(2);expect(result.every(r=>r.publicId===null&&r.team===null&&r.name==='Jogador não informado pela fonte')).toBe(true);
});
it('retains official standings and leaves missing metrics unavailable',()=>{
 const row=unlinkedStanding({provider_record_id:1,payload:{position:56,points:0,stage:{name:'Play-offs'},details:[{type_id:129,value:2},{type_id:133,value:0},{type_id:134,value:2}],form:[{sort_order:1,form:'L'}]}});
 expect(row).toMatchObject({sourceKey:'unlinked-standing:1',team:null,position:56,points:0,played:2,goalsFor:0,goalsAgainst:2,goalDifference:-2,won:null,form:['L']});
});
it('localizes unavailable associations in every interface language',()=>{
 expect(unlinkedTeamLabel('br')).toBe('Time não informado pela fonte');expect(unlinkedTeamLabel('mx')).toBe('Equipo no informado por la fuente');expect(unlinkedTeamLabel('en')).toBe('Team not supplied by the source');
});
