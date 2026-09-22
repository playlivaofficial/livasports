import {scoreFixture,type FixtureSignals} from './scoring';
import type {RankedGrowthFixture} from './types';

export const testNow=new Date('2026-09-22T12:00:00.000Z');
export function testSignals(over:Partial<FixtureSignals>={}):FixtureSignals{
  return {fixtureId:'11111111-1111-4111-8111-111111111111',publicId:'1111111111111111',kickoff:'2026-09-22T18:00:00.000Z',status:'SCHEDULED',
    competitionSlug:'brasileirao-serie-a',competitionName:'Brasileirão Série A',competitionType:'DOMESTIC_LEAGUE',seasonName:'2026',
    home:{slug:'flamengo',name:'Flamengo',publicId:'aaaaaaaaaaaaaaaa',imageUrl:'https://cdn.sportmonks.com/images/soccer/teams/1/1.png'},
    away:{slug:'mirassol',name:'Mirassol',publicId:'bbbbbbbbbbbbbbbb',imageUrl:null},stageName:null,roundName:'Rodada 30',venue:'Maracanã',
    standings:{homePosition:1,awayPosition:12,totalTeams:20},oddsBookmakers:2,...over};
}
export function rankedFixture(over:Partial<FixtureSignals>={}):RankedGrowthFixture{
  const signals=testSignals(over),priority=scoreFixture(signals,testNow);
  return {signals,priority,destinationPath:`/br/jogo/${signals.publicId}`,destinationUrl:`https://livasports.com/br/jogo/${signals.publicId}`,
    odds:{count:signals.oddsBookmakers,bookmakers:Array.from({length:signals.oddsBookmakers},(_,i)=>({slug:`book-${i}`,name:`Casa ${i+1}`})),
      label:signals.oddsBookmakers?`${signals.oddsBookmakers} casas com odds atuais`:'Sem odds atuais'}};
}
