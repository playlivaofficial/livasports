import {describe,expect,it} from 'vitest';
import {fixtureEligibility,scoreFixture,stageStrength} from './scoring';
import {testNow,testSignals} from './fixtures.test-support';

describe('Traffic Engine V1 scoring',()=>{
  it('uses canonical team country for local affinity instead of inherited Brazil club defaults',()=>{
    const local=testSignals({home:{slug:'unlisted-local-club',name:'Local',publicId:'a'.repeat(16),imageUrl:null,country:'CO'}});
    const co=scoreFixture(local,testNow,{geo:'CO'}),mx=scoreFixture(local,testNow,{geo:'MX'});
    expect(co.lines.find(l=>l.component==='clubs')!.points).toBeGreaterThan(mx.lines.find(l=>l.component==='clubs')!.points);
    expect(co.reasons.join(' ')).toContain('CO');
    expect(scoreFixture(testSignals(),testNow,{geo:'MX'}).lines.find(l=>l.component==='clubs')!.points).toBeLessThan(10);
  });
  it('gives MX CO PE independent seeds, never hardcoded Brazil demand',()=>{
    for(const [geo,slug] of [['MX','liga-mx'],['CO','colombia-primera-a'],['PE','peru-liga-1']] as const){
      const local=scoreFixture(testSignals({competitionSlug:slug}),testNow,{geo});
      const brazil=scoreFixture(testSignals(),testNow,{geo});
      expect(local.total).toBeGreaterThan(brazil.total);
      expect(local.lines.find(l=>l.component==='competition')!.points).toBe(30);
    }
  });
  it('lets major Champions League knockouts outrank ordinary domestic matches',()=>{
    const champions=scoreFixture(testSignals({competitionSlug:'champions-league',competitionName:'UEFA Champions League',competitionType:'CONTINENTAL_CLUB',
      home:{slug:'real-madrid',name:'Real Madrid',publicId:'c'.repeat(16),imageUrl:null},away:{slug:'barcelona',name:'Barcelona',publicId:'d'.repeat(16),imageUrl:null},stageName:'Semi-finals'}),testNow,{geo:'MX'});
    const domestic=scoreFixture(testSignals({competitionSlug:'liga-mx',home:{slug:'local-a',name:'A',publicId:'a',country:'MX',imageUrl:null},away:{slug:'local-b',name:'B',publicId:'b',country:'MX',imageUrl:null}}),testNow,{geo:'MX'});
    expect(champions.total).toBeGreaterThan(domestic.total);
  });
  it('scores configured derbies and does not misclassify semi-finals as finals',()=>{
    const derby=scoreFixture(testSignals({home:{slug:'corinthians',name:'Corinthians',publicId:'a'.repeat(16),imageUrl:null},away:{slug:'palmeiras',name:'Palmeiras',publicId:'b'.repeat(16),imageUrl:null}}),testNow);
    expect(derby.rivalry).toBe('Derby Paulista');expect(derby.lines.find(line=>line.component==='rivalry')?.points).toBe(14);
    expect(stageStrength('Semi-final',null)).toEqual({strength:.85,label:'Semi-final'});
    expect(stageStrength('Final',null)).toEqual({strength:1,label:'Final'});
  });
  it('lets excellent current odds coverage beat otherwise identical no-odds inventory',()=>{
    const covered=scoreFixture(testSignals({oddsBookmakers:2}),testNow),missing=scoreFixture(testSignals({oddsBookmakers:0}),testNow);
    expect(covered.total-missing.total).toBeCloseTo(13.6);
    expect(missing.reasons).not.toContain('no bookmaker prices yet');
  });
  it.each(['FINISHED','CANCELLED','ABANDONED','POSTPONED','LIVE','IN_PLAY'])('excludes %s fixtures',status=>{
    const score=scoreFixture(testSignals({status}),testNow);expect(score.eligible).toBe(false);expect(score.total).toBe(0);
  });
  it('excludes stale inventory outside the planning window',()=>{
    expect(fixtureEligibility(testSignals({kickoff:'2026-09-20T00:00:00Z'}),testNow).eligible).toBe(false);
    expect(fixtureEligibility(testSignals({kickoff:'2026-10-02T00:00:00Z'}),testNow).eligible).toBe(false);
  });
  it('does not infer title or relegation pressure from an unverified table format',()=>{
    const league=scoreFixture(testSignals(),testNow),cup=scoreFixture(testSignals({competitionType:'DOMESTIC_CUP'}),testNow);
    expect(league.lines.find(line=>line.component==='standings')!.points).toBe(0);
    expect(cup.lines.find(line=>line.component==='standings')!.points).toBe(0);
  });
  it('excludes already-started scheduled fixtures and unusable pages',()=>{
    expect(fixtureEligibility(testSignals({kickoff:testNow.toISOString()}),testNow).eligible).toBe(false);
    expect(fixtureEligibility(testSignals({pageUsable:false}),testNow).eligible).toBe(false);
  });
  it('keeps bettor intent more important than supporting GSC and bounds noisy values',()=>{
    const intent=scoreFixture(testSignals(),testNow,{geo:'PE',intentStrength:1});
    const search=scoreFixture(testSignals(),testNow,{geo:'PE',searchStrength:1});
    expect(intent.total-search.total).toBe(21);
    expect(scoreFixture(testSignals(),testNow,{geo:'PE',intentStrength:100}).total).toBe(intent.total);
  });
});
