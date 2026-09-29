import {describe,it,expect} from 'vitest';
import {factualMatchContent} from './content';
import type {MatchCenterView,MatchHistoryView} from '@/match-center/types';
import {FixtureStatus} from '@/domain/enums';

function sample(){
  return {header:{home:{name:'São Paulo',publicId:'1111111111111111'},away:{name:'Santos',publicId:'2222222222222222'},
    competition:'Brasileirão Série A',kickoff:'2026-10-02T23:00:00Z',status:'SCHEDULED',homeScore:null,awayScore:null,venue:null,venueCity:null},
    form:{state:'NO_DATA_IN_WINDOW',data:{home:[],away:[],headToHead:[]}},standings:{state:'NO_DATA_IN_WINDOW',data:[]},statistics:{state:'NO_DATA_IN_WINDOW',data:[]}} as unknown as Pick<MatchCenterView,'header'|'form'|'standings'|'statistics'>;
}
const prior:MatchHistoryView={id:'one',publicId:'3333333333333333',kickoff:'2026-09-01T20:00:00Z',home:'São Paulo',away:'Santos',homeScore:1,awayScore:0,status:FixtureStatus.FINISHED,perspective:'W'};
describe('source-backed PT-BR content',()=>{
  it('uses the real Brazilian time and omits unavailable facts',()=>{const c=factualMatchContent(sample());expect(c.description).toContain('20:00');expect(c.facts).toEqual(['fixture']);expect(c.paragraphs).toHaveLength(1);expect(c.title).not.toMatch(/odds|palpite|escalações|assistir/);});
  it('never invents a score for an incomplete finished record',()=>{const m=sample();m.header.status=FixtureStatus.FINISHED;m.header.homeScore=2;expect(factualMatchContent(m).description).not.toContain('2 x');});
  it('updates to the actual final score without changing the fixture route',()=>{const m=sample();m.header.status=FixtureStatus.FINISHED;m.header.homeScore=2;m.header.awayScore=0;expect(factualMatchContent(m).description).toContain('São Paulo 2 x 0 Santos');expect(factualMatchContent(m).title).toContain('resultado');});
  it('omits stale form and H2H even when old data is retained',()=>{const m=sample();m.form.state='STALE';m.form.data={home:[prior,prior,prior],away:[],headToHead:[prior]};const c=factualMatchContent(m);expect(c.paragraphs).toHaveLength(1);expect(c.h2hLinks).toEqual([]);});
  it('filters future/nonfinal results and labels the limited H2H sample',()=>{const m=sample();m.form.state='AVAILABLE';m.form.data={home:[prior,{...prior,status:FixtureStatus.SCHEDULED},{...prior,kickoff:'2027-01-01'}],away:[],headToHead:[prior]};const c=factualMatchContent(m);expect(c.paragraphs.join(' ')).not.toContain('vitórias');expect(c.paragraphs.join(' ')).toContain('Não representa necessariamente todo o histórico');expect(c.h2hLinks[0].href).toContain(prior.publicId);});
});
