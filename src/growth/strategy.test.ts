import {describe,expect,it} from 'vitest';
import {generateV11ContentPack} from './content';
import {playerEvidenceScore,readiness,searchIntent,selectedPlayers,selectStory,seoPriority} from './strategy';
import {rankedFixture} from './fixtures.test-support';
import type {GrowthPlayerCandidate} from './types';

const player=(team:'home'|'away',eligible=false):GrowthPlayerCandidate=>({id:`${team}-id`,publicId:`${team}-public`,teamId:`${team}-team`,teamName:team==='home'?'Flamengo':'Palmeiras',name:team==='home'?'Atacante A':'Atacante B',
  statistics:{appearances:12,starts:10,minutes:900,goals:8,assists:3},evidenceScore:0,selectionReason:'artilheiro atual do elenco nos dados da temporada (8 gols)',
  media:{source:eligible?'LIVA_APPROVED':null,licenseStatus:eligible?'APPROVED':'UNKNOWN',commercialEligible:eligible,assetUrl:eligible?'https://livasports.com/media/player.png':null,evidence:eligible?'contract-1':null}});

describe('Traffic Engine V1.1 strategy',()=>{
  it('maps real search intents to the existing canonical and applies the shared Top 5 prominence',()=>{
    const row=rankedFixture(),intent=searchIntent(row),seo=seoPriority(row,1);
    expect(intent.canonicalUrl).toBe(row.destinationUrl);expect(intent.queries).toContain('Flamengo x Mirassol odds');expect(seo.level).toBe('TOP_5');
    expect(seo.placements).toEqual(['HOME','DAILY','COMPETITION','HOME_TEAM','AWAY_TEAM']);
  });
  it('keeps player-led templates dormant when evidence exists but commercial media rights do not',()=>{
    const home=player('home'),away=player('away');home.evidenceScore=playerEvidenceScore(home.statistics);away.evidenceScore=playerEvidenceScore(away.statistics);
    const row={...rankedFixture({away:{slug:'palmeiras',name:'Palmeiras',publicId:'b'.repeat(16),imageUrl:null}}),storySignals:{players:{home:[home],away:[away]},form:{home:null,away:null}}};
    const chosen=selectedPlayers(row),story=selectStory(row,chosen,{rank:2,topSocial:[row]});expect(chosen).toHaveLength(2);expect(story).toMatchObject({angle:'TABLE_PRESSURE',template:'MATCH_CLASH'});
    expect(chosen[0].media).toMatchObject({licenseStatus:'UNKNOWN',commercialEligible:false,assetUrl:null});
    const pack=generateV11ContentPack(row,2,[row]),assets=pack.platforms?.TIKTOK.scenes.flatMap(scene=>scene.assets)??[];
    expect(pack.players).toHaveLength(2);expect(pack.readiness?.fallbackApplied).toBe(true);expect(assets.some(asset=>asset.kind==='PLAYER_IMAGE'||asset.kind==='PLAYER_SILHOUETTE')).toBe(false);
    expect(assets.some(asset=>asset.kind==='TEAM_CREST')).toBe(true);
  });
  it('activates Player Clash only when both defensible players have approved commercial media',()=>{
    const home=player('home',true),away=player('away',true);home.evidenceScore=playerEvidenceScore(home.statistics);away.evidenceScore=playerEvidenceScore(away.statistics);
    const row={...rankedFixture({away:{slug:'palmeiras',name:'Palmeiras',publicId:'b'.repeat(16),imageUrl:null}}),storySignals:{players:{home:[home],away:[away]},form:{home:null,away:null}}};
    const chosen=selectedPlayers(row),story=selectStory(row,chosen,{rank:2,topSocial:[row]}),pack=generateV11ContentPack(row,2,[row]);
    expect(story).toMatchObject({angle:'PLAYER_VS_PLAYER',template:'PLAYER_CLASH'});
    expect(pack.platforms?.TIKTOK.scenes.flatMap(scene=>scene.assets).filter(asset=>asset.kind==='PLAYER_IMAGE')).toHaveLength(2);
  });
  it('activates Star Focus only with defensible player evidence and explicit commercial media approval',()=>{
    const star=player('home',true);star.evidenceScore=playerEvidenceScore(star.statistics);
    const row={...rankedFixture({standings:null}),storySignals:{players:{home:[star],away:[]},form:{home:null,away:null}}};
    const chosen=selectedPlayers(row),story=selectStory(row,chosen,{rank:2,topSocial:[row]}),pack=generateV11ContentPack(row,2,[row]);
    expect(story).toMatchObject({angle:'STAR_FOCUS',template:'STAR_FOCUS'});expect(chosen).toHaveLength(1);
    expect(pack.platforms?.INSTAGRAM_REELS.scenes.flatMap(scene=>scene.assets)).toContainEqual(expect.objectContaining({kind:'PLAYER_IMAGE',commercialEligible:true}));
  });
  it('uses verified rivalry before weaker signals and falls back structurally when quality is low',()=>{
    const row=rankedFixture({away:{slug:'fluminense',name:'Fluminense',publicId:'b'.repeat(16),imageUrl:null},oddsBookmakers:0,standings:null});
    expect(selectStory(row,[],{rank:2,topSocial:[row]})).toMatchObject({angle:'DERBY_RIVALRY',template:'MATCH_CLASH'});
    const low=rankedFixture({competitionSlug:'unknown',competitionName:'Regional',home:{slug:'small-a',name:'Small A',publicId:'a'.repeat(16),imageUrl:null},away:{slug:'small-b',name:'Small B',publicId:'b'.repeat(16),imageUrl:null},oddsBookmakers:0,standings:null,venue:null});
    expect(readiness(low,{angle:'WEEKEND_WATCHLIST',template:'MATCH_CLASH',reason:'score'},[]).state).not.toBe('READY');
  });
  it('never emits prediction, injury, lineup or broadcast claims',()=>{
    const copy=JSON.stringify(generateV11ContentPack(rankedFixture(),1,[rankedFixture()]));
    expect(copy).not.toMatch(/aposta certa|palpite|favorito para vencer|les[aã]o|transmiss[aã]o|escala[cç][aã]o esperada/i);
  });
});
