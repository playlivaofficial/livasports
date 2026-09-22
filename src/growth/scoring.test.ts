import {describe,expect,it} from 'vitest';
import {fixtureEligibility,scoreFixture,stageStrength} from './scoring';
import {testNow,testSignals} from './fixtures.test-support';

describe('Traffic Engine V1 scoring',()=>{
  it('ranks Flamengo and the other national-priority Brazilian clubs from centralized truthful configuration',()=>{
    const flamengo=scoreFixture(testSignals(),testNow);
    const obscure=scoreFixture(testSignals({home:{slug:'small-club',name:'Small Club',publicId:'c'.repeat(16),imageUrl:null}}),testNow);
    expect(flamengo.total).toBeGreaterThan(obscure.total);
    for(const slug of ['corinthians','palmeiras','sao-paulo']){
      const score=scoreFixture(testSignals({home:{slug,name:slug,publicId:'c'.repeat(16),imageUrl:null}}),testNow);
      expect(score.lines.find(line=>line.component==='clubs')!.points).toBeGreaterThan(20);
    }
    expect(scoreFixture(testSignals({home:{slug:'sao-paulo-fc',name:'São Paulo FC',publicId:'d'.repeat(16),imageUrl:null}}),testNow)
      .lines.find(line=>line.component==='clubs')!.points).toBeGreaterThan(20);
  });
  it('prefers Brasileirão Série A to a low-interest foreign competition',()=>{
    const brazil=scoreFixture(testSignals({home:{slug:'small-a',name:'A',publicId:'a'.repeat(16),imageUrl:null}}),testNow);
    const foreign=scoreFixture(testSignals({competitionSlug:'unknown-foreign',competitionName:'Foreign League',
      home:{slug:'small-a',name:'A',publicId:'a'.repeat(16),imageUrl:null}}),testNow);
    expect(brazil.total-foreign.total).toBeGreaterThan(20);
  });
  it('recognizes a major Champions League fixture and a Brazilian Libertadores fixture without inventing trends',()=>{
    const champions=scoreFixture(testSignals({competitionSlug:'champions-league',competitionName:'UEFA Champions League',competitionType:'CONTINENTAL_CLUB',
      home:{slug:'real-madrid',name:'Real Madrid',publicId:'c'.repeat(16),imageUrl:null},away:{slug:'barcelona',name:'Barcelona',publicId:'d'.repeat(16),imageUrl:null},stageName:'Semi-finals'}),testNow);
    const libertadores=scoreFixture(testSignals({competitionSlug:'copa-libertadores',competitionName:'Copa Libertadores',competitionType:'CONTINENTAL_CLUB',
      away:{slug:'river-plate',name:'River Plate',publicId:'d'.repeat(16),imageUrl:null},stageName:'Quarter-finals'}),testNow);
    expect(champions.total).toBeGreaterThan(60);expect(libertadores.total).toBeGreaterThan(70);
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
  it.each(['FINISHED','CANCELLED','ABANDONED','POSTPONED'])('excludes %s fixtures',status=>{
    const score=scoreFixture(testSignals({status}),testNow);expect(score.eligible).toBe(false);expect(score.total).toBe(0);
  });
  it('excludes stale inventory outside the planning window',()=>{
    expect(fixtureEligibility(testSignals({kickoff:'2026-09-20T00:00:00Z'}),testNow).eligible).toBe(false);
    expect(fixtureEligibility(testSignals({kickoff:'2026-10-02T00:00:00Z'}),testNow).eligible).toBe(false);
  });
  it('uses standings only for league competitions',()=>{
    const league=scoreFixture(testSignals(),testNow),cup=scoreFixture(testSignals({competitionType:'DOMESTIC_CUP'}),testNow);
    expect(league.lines.find(line=>line.component==='standings')!.points).toBeGreaterThan(0);
    expect(cup.lines.find(line=>line.component==='standings')!.points).toBe(0);
  });
});
