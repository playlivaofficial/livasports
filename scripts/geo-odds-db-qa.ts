/** Isolated PostgreSQL QA helper. No environment loading, provider calls or production connection. */
import assert from 'node:assert/strict';
import type {DatabaseClient} from '../src/database/client';
import {persistGeoSnapshotQuotes} from '../src/odds/geo-persistence';
import {readGeoCoverageInputs} from '../src/odds/geo-coverage';
import {readOddsSnapshot} from '../src/odds/read-core';
import type {OddsSnapshot,OddsQuote} from '../src/odds/types';
import {readVerifiedOperatorFeeds} from '../src/odds/operator-feeds';

export async function runGeoSqlAssertions(db:DatabaseClient,fixture:{fixtureId:string;competitionId:string;homeTeamId:string;awayTeamId:string;now:string|Date;kickoff:string|Date}){
  const observedAt=new Date(fixture.now).toISOString(),kickoff=new Date(fixture.kickoff).toISOString();
  const operator=(await db.query("SELECT id FROM bookmakers WHERE provider_slug='betsson'")).rows[0]?.id;
  assert.ok(operator,'Baseline Betsson must exist');
  await db.query(`UPDATE bookmaker_geo_availability SET sportsbook_enabled=true,odds_enabled=true,comparison_enabled=true,
    legal_status='VERIFIED',legal_verified_at=$2,legal_reference='isolated synthetic legal evidence',verified_at=$2,
    verification_state='VERIFIED',source_domains=CASE WHEN country_id=(SELECT id FROM countries WHERE iso2='CO') THEN ARRAY['betsson.co'] ELSE ARRAY['betsson.pe'] END
    WHERE bookmaker_id=$1 AND country_id IN(SELECT id FROM countries WHERE iso2 IN('CO','PE'))`,[operator,observedAt]);
  await db.query(`INSERT INTO operator_provider_mappings(bookmaker_id,country_id,provider,provider_bookmaker_id,verified_at,evidence)
    SELECT $1,id,'ODDSPAPI',CASE iso2 WHEN 'CO' THEN 'betsson.co' ELSE 'betsson.pe' END,$2,'{"source":"isolated QA"}'::jsonb FROM countries WHERE iso2 IN('CO','PE')`,[operator,observedAt]);
  const meta=JSON.stringify({canonicalKickoff:kickoff,homeProviderId:'qa-geo-home',awayProviderId:'qa-geo-away',providerCompetitionId:'325'});
  for(const [type,id,canonical,metadata] of [['TEAM','qa-geo-home',fixture.homeTeamId,'{}'],['TEAM','qa-geo-away',fixture.awayTeamId,'{}'],
    ['COMPETITION','325',fixture.competitionId,'{}'],['FIXTURE','qa-geo-fixture',fixture.fixtureId,meta]]){
    await db.query(`INSERT INTO provider_entity_mappings(provider,entity_type,provider_entity_id,livasports_entity_id,metadata)
      VALUES('ODDSPAPI',$1,$2,$3,$4::jsonb) ON CONFLICT(provider,entity_type,provider_entity_id) DO UPDATE SET livasports_entity_id=excluded.livasports_entity_id,metadata=excluded.metadata`,[type,id,canonical,metadata]);
  }
  await db.query(`INSERT INTO odds_mapping_reviews(provider_fixture_id,fixture_id,state,reason,evidence,observed_at)
    VALUES('qa-geo-fixture',$1,'EXACT','Isolated canonical identity QA','{"providerCompetitionId":"325"}'::jsonb,$2)
    ON CONFLICT(provider_fixture_id) DO UPDATE SET fixture_id=excluded.fixture_id,state=excluded.state,evidence=excluded.evidence`,[fixture.fixtureId,observedAt]);
  const quote:OddsQuote & {fixtureId:string}={fixtureId:fixture.fixtureId,bookmaker:'betsson',providerFixtureId:'qa-geo-fixture',market:'MATCH_WINNER',outcome:'HOME',line:null,
    decimalOdds:'2.10',status:'ACTIVE',scope:'FULL_TIME_REGULATION',phase:'PREGAME',providerUpdatedAt:observedAt,observedAt,sourceDomain:'betsson.co',providerKickoff:kickoff,freshnessTtlMinutes:120};
  const feeds=await readVerifiedOperatorFeeds(db);
  assert.equal(feeds.length,2);
  const snapshot=(geo:'CO'|'PE',at=observedAt):OddsSnapshot=>({provider:'ODDSPAPI',bookmaker:'betsson',providerBookmakerId:`betsson.${geo.toLowerCase()}`,geoFeeds:feeds.filter(f=>f.geo===geo),observedAt:at,fixtures:[],quotes:[],rejected:{},tournamentIds:['325']});
  const save=(geo:'CO'|'PE',price:string,at=observedAt)=>db.transaction(tx=>persistGeoSnapshotQuotes(tx,snapshot(geo,at),[{...quote,decimalOdds:price,observedAt:at,sourceDomain:`betsson.${geo.toLowerCase()}`}],[]));
  await save('CO','2.10');await save('PE','2.60');
  const stored=(await db.query("SELECT geo,decimal_odds::text AS price,id FROM odds_geo_current WHERE fixture_id=$1 ORDER BY geo",[fixture.fixtureId])).rows;
  assert.deepEqual(stored.map(r=>[r.geo,Number(r.price)]),[['CO',2.1],['PE',2.6]]);
  assert.equal(Number((await db.query(`SELECT count(*) FROM odds_geo_history h JOIN odds_geo_current c ON c.id=h.quote_id
    WHERE h.fixture_id=$1 AND h.geo=c.geo AND h.provider_bookmaker_id=c.provider_bookmaker_id`,[fixture.fixtureId])).rows[0].count),2,'First history row must reference actual persisted quote id');
  await save('CO','1.5',new Date(+new Date(observedAt)-60_000).toISOString());
  assert.equal(Number((await db.query("SELECT decimal_odds FROM odds_geo_current WHERE fixture_id=$1 AND geo='CO'",[fixture.fixtureId])).rows[0].decimal_odds),2.1,'Older replay cannot overwrite current');
  await assert.rejects(db.transaction(tx=>persistGeoSnapshotQuotes(tx,snapshot('CO'),[{...quote,sourceDomain:'betsson.pe'}],[fixture.fixtureId])),/GEO_SOURCE_UNVERIFIED/);
  for(const geo of ['CO','PE'] as const){const read=await readOddsSnapshot(db,fixture.fixtureId,geo);assert.equal(read.insuranceEnabled,false);assert.equal(read.quotes.filter(q=>q.geoEligible).length,1);assert.equal(Number(read.quotes[0].decimalOdds),geo==='CO'?2.1:2.6);assert.deepEqual(read.destinations,{});}
  assert.equal((await readOddsSnapshot(db,fixture.fixtureId,'MX')).quotes.length,0,'MX cannot borrow a price from CO or PE');
  const coverage=await readGeoCoverageInputs(db,new Date(observedAt));
  assert.equal(coverage.find(c=>c.geo==='CO'&&c.canonicalCompetition==='brasileirao-serie-a')?.windows['7d'].anyOdds,1);
  assert.equal(coverage.find(c=>c.geo==='MX'&&c.canonicalCompetition==='brasileirao-serie-a')?.windows['7d'].anyOdds,0);
  assert.equal(coverage.find(c=>c.geo==='CO'&&c.canonicalCompetition==='brasileirao-serie-a')?.windows['7d'].matchWinner,0,'Incomplete 1X2 is not a complete market');
  // A verified explicit close never removes another jurisdiction's price.
  const after=new Date(+new Date(observedAt)+1_000).toISOString();
  await db.transaction(tx=>persistGeoSnapshotQuotes(tx,snapshot('CO',after),[],[fixture.fixtureId]));
  const statuses=(await db.query('SELECT geo,status FROM odds_geo_current WHERE fixture_id=$1 ORDER BY geo',[fixture.fixtureId])).rows;
  assert.deepEqual(statuses.map(r=>[r.geo,r.status]),[['CO','CLOSED'],['PE','ACTIVE']]);
  return {checks:13,crossGeoPrices:'PASS',publicReads:'PASS',affiliateOff:'PASS',staleReplay:'PASS',historyIdentity:'PASS',countryClosure:'PASS',coverageSql:'PASS'};
}
