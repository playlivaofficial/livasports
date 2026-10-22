import {describe,it,expect} from 'vitest';
import {extractAnnouncement,announcementErrors} from './announcements';
import {factErrors,eventKey,stableFacts,fingerprint,toNewsDraft,copyErrors} from './policy';
import {primaryFeedAnnouncements} from '../primary-feed-discovery';
const now=new Date('2026-10-21T13:00:00Z');
const nba={desk:'nba-releases',url:'https://pr.nba.com/roster-announcement',headline:'NBA rosters feature 125 international players from record-tying 43 countries across six continents',sourceDate:'2026-10-20'};
const body='The NBA announced that 125 international players from a record-tying 43 countries across six continents are on opening-night rosters for the 2026-27 season.';
const copa={desk:'dimayor-releases',url:'https://dimayor.com.co/2026/10/20/referee-appointments',headline:'Designaciones arbitrales Barranquilla FC vs. América de Cali Copa BetPlay DIMAYOR 2026',sourceDate:'2026-10-20'};
describe('source-specific primary announcements',()=>{
 it('corroborates Copa qualification without importing scores, prose or scheduling claims',()=>{
  const candidate={desk:'dimayor-releases',url:'https://dimayor.com.co/2026/10/21/qualification',headline:'América de Cali clasificado a las Semifinales de la Copa BetPlay DIMAYOR 2026',sourceDate:'2026-10-22'};
  const clock=new Date('2026-10-22T08:00:00Z');
  const text='América de Cali consiguió su clasificación a las semifinales de la Copa BetPlay DIMAYOR 2026, luego de vencer 4-0 a Barranquilla FC.';
  const f=extractAnnouncement(candidate,text,clock)!;
  expect(f.detail).toEqual({type:'qualification',participant:'América de Cali',stage:'semi-final',season:'2026'});
  expect(f.competition).toBe('copa-colombia');expect(factErrors(f,clock)).toEqual([]);
  expect(JSON.stringify(f)).not.toContain('4-0');expect(JSON.stringify(f)).not.toContain('Barranquilla');
  const reordered=JSON.parse(JSON.stringify(f));reordered.detail=Object.fromEntries(Object.entries(reordered.detail).reverse());expect(factErrors(reordered,clock)).toEqual([]);
  for(const conflict of [text.replace('América de Cali','Otro Club'),text.replace('2026','2025'),text.replace('semifinales','final'),text.replace('consiguió','no consiguió')])expect(extractAnnouncement(candidate,conflict,clock)).toBeNull();
  expect(extractAnnouncement({...candidate,sourceDate:'2025-10-22'},text,clock)).toBeNull();
  const copy={
   en:{title:'América de Cali reaches Copa semifinals',summary:'DIMAYOR confirms América de Cali has qualified for the Copa semifinals.',body:'DIMAYOR confirms América de Cali has qualified for the 2026 Copa BetPlay semifinals.'},
   es:{title:'América de Cali llega a semifinales de Copa',summary:'DIMAYOR confirma la clasificación de América de Cali a las semifinales de Copa.',body:'DIMAYOR confirma que América de Cali se clasificó a las semifinales de la Copa BetPlay 2026.'},
   pt:{title:'América de Cali avança à semifinal da Copa',summary:'DIMAYOR confirma América de Cali nas semifinais da Copa BetPlay.',body:'DIMAYOR confirma a classificação do América de Cali para as semifinais da Copa BetPlay 2026.'}
  };
  expect(copyErrors(copy,f)).toEqual([]);expect(toNewsDraft(copy,f,clock).competition).toBe('copa-colombia');
  expect(copyErrors({...copy,en:{...copy.en,body:copy.en.body+' They won 4-0.'}},f)).toContain('en:UNSUPPORTED_NUMBER');
 });
 it('keeps metadata ineligible and separates announcements from match results',()=>{
  expect(factErrors({kind:'metadata',candidate:nba},now)).toEqual(['SOURCE_RIGHTS_AND_FACT_REVIEW']);
  const f=extractAnnouncement(nba,body,now)!;expect(f.detail.type).toBe('roster-announcement');expect(factErrors(f,now)).toEqual([]);expect(f.competition).toBe('nba');
  expect(eventKey(f)).toBe(eventKey({kind:'metadata',candidate:nba}));
 });
 it('requires corroboration, safe counts, explicit scope and current source dates',()=>{
  expect(extractAnnouncement(nba,body.replace('125','126'),now)).toBeNull();
  expect(extractAnnouncement(nba,body.replace('opening-night','mid-season'),now)).toBeNull();
  expect(extractAnnouncement({...nba,sourceDate:'2026-01-01'},body,now)).toBeNull();
  expect(extractAnnouncement({...nba,url:'https://evil.test/story'},body,now)).toBeNull();
  expect(extractAnnouncement(nba,'',now)).toBeNull();
 });
 it('detects changed facts but not observation-clock churn',()=>{
  const f=extractAnnouncement(nba,body,now)!;
  const reordered=JSON.parse(JSON.stringify(f));reordered.detail=Object.fromEntries(Object.entries(reordered.detail).reverse());
  expect(announcementErrors(reordered,now)).toEqual([]);
  expect(fingerprint(stableFacts(f))).toBe(fingerprint(stableFacts({...f,observedAt:new Date(+now+1000).toISOString()})));
  expect(announcementErrors({...f,detail:{...f.detail,type:'league-announcement',authority:'NBA',action:'unknown',subject:'unknown'}},now)).not.toEqual([]);
 });
 it('classifies referee appointments as Copa BetPlay, not Primera A or a played match',()=>{
  const f=extractAnnouncement(copa,'Copa BetPlay DIMAYOR Cuartos de Final BARRANQUILLA FC VS. AMÉRICA DE CALI Árbitro Jairo Mayorga Tolima Asistente',now)!;
  expect(f.competition).toBe('copa-colombia');expect(f.detail).toEqual({type:'fixture-announcement',participants:['Barranquilla FC','América de Cali'],stage:'quarter-final',action:'referee-appointments',referee:'Jairo Mayorga'});
  expect(extractAnnouncement(copa,'Cuartos de Final missing fixture and referee',now)).toBeNull();
 });
 it('reads feed cells without joining names, retaining only facts',()=>{
  const xml=`<rss xmlns:content="urn:content"><channel><item><title>${copa.headline}</title><link>${copa.url}</link><pubDate>Tue, 20 Oct 2026 12:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Copa BetPlay DIMAYOR Cuartos de Final</p><p>BARRANQUILLA FC VS. AMÉRICA DE CALI</p><table><tr><td>Árbitro</td><td>Jairo Mayorga</td><td>Tolima</td></tr></table>]]></content:encoded></item></channel></rss>`;
  const result=primaryFeedAnnouncements(xml,copa.desk,now);expect(result).toHaveLength(1);expect(JSON.stringify(result)).not.toContain('<table>');
 });
 it('requires sources, distinct translations and no invented numbers in copy',()=>{
  const f=extractAnnouncement(nba,body,now)!;
  const en={title:'NBA announces opening roster totals',summary:'The league reports international representation on opening-night rosters.',body:'NBA Communications reports 125 international players from 43 countries across 6 continents on opening-night rosters.'};
  const es={...en,title:'La NBA anuncia sus cifras internacionales',body:'NBA Communications informa de 125 jugadores internacionales de 43 países y 6 continentes en las plantillas iniciales.'};
  const pt={...en,title:'NBA apresenta números internacionais',body:'NBA Communications informa que os elencos de abertura incluem 125 jogadores internacionais de 43 países e 6 continentes.'};
  const copy={en,es,pt};expect(copyErrors(copy,f)).toEqual([]);expect(toNewsDraft(copy,f,now).sport).toBe('basketball');
  expect(copyErrors({...copy,en:{...en,body:en.body+' 700 players.'}},f)).toContain('en:UNSUPPORTED_NUMBER');
  expect(copyErrors({...copy,pt:en},f)).toContain('TRANSLATION_NOT_DISTINCT');
 });
});
