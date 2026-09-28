import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {tiktokComplianceCheck,youtubeGamblingComplianceCheck,draftCompliance,socialCompliance,socialDraftIdentity,matchesSocialDraftIdentity,socialMasterIdentity} from './socialCompliance';
import {generatedContent,generateV11ContentPack,fixtureSnapshot} from './content';
import {rankedFixture,testNow} from './fixtures.test-support';
import {socialFrames,svgText,renderSocialPackage} from './social-renderer';
import {publishingItem} from './manual.test-support';
import {currentAssetReady,postSnapshot,socialExportReady} from './manual-publishing';
import {VIDEO_CHANNELS} from './config';
import {persistGrowthItem} from './repository';
import type {DatabaseClient} from '@/database/client';

describe('strict platform compliance',()=>{
  const banned=['melhores odds','apostas','monte seu bilhete','apostar agora','bônus','free bet','bookmaker','compare as odds','aposte agora','ganhe','deposite','jogue agora','Betsson','Sportingbet','betboo','Betano','retorno garantido','guaranteed win','clique para apostar','#melhoresodds','b&#244;nus','o\u200bdds'];
  it.each(banned)('rejects %s on every export surface',phrase=>{
    for(const field of ['renderedText','subtitleText','voiceoverScript','caption','hashtags','cta','coverText','metadata','altText'])
      expect(tiktokComplianceCheck({[field]:field==='metadata'?{nested:[phrase]}:phrase}).status,field).toBe('blocked_for_review');
  });
  it.each(['São Paulo x Santos — veja os principais dados','Quem chega melhor? Confira forma e H2H'])('accepts editorial wording: %s',caption=>expect(tiktokComplianceCheck({caption}).status).toBe('ready'));
  it('does not infer compliance for empty or unknown output',()=>expect(tiktokComplianceCheck({}).status).toBe('blocked_for_review'));
  it('rejects promotional codes without needing to recognize an operator',()=>expect(tiktokComplianceCheck({caption:'Use o cupom LIVA100'}).status).toBe('blocked_for_review'));
  it('blocks malformed persisted drafts instead of throwing or showing ready',()=>{
    expect(draftCompliance({} as never).status).toBe('blocked_for_review');
    const draft=publishingItem().content.platforms!.TIKTOK;draft.social!.generatedAt='unknown';expect(draftCompliance(draft).status).toBe('blocked_for_review');
  });
  it('scans metadata keys as well as nested values',()=>expect(tiktokComplianceCheck({metadata:{Betsson:true}}).status).toBe('blocked_for_review'));
  it('blocks uncertified destinations and spoken access on YouTube',()=>{
    for(const caption of ['Visite example.com','Acesse bit.ly/jogo','Vá para o site da Betsson','Guaranteed returns','https://livasports.com/redirect?to=operator'])
      expect(youtubeGamblingComplianceCheck({caption}).status).toBe('blocked_for_review');
  });
  it('keeps all defaults conservative with no inferred account approval',()=>{
    expect(socialCompliance.tiktokRiskMode).toBe('strict');expect(socialCompliance.instagramAllowBettingContext).toBe(false);expect(socialCompliance.approvals).toEqual([]);
  });
  it('rejects odds cards and affiliate buttons even without banned copy',()=>{
    for(const key of ['oddsTable','bookmakerLogos','affiliateButtons','unknownAssets'])expect(tiktokComplianceCheck({caption:'Futebol',visuals:{oddsTable:false,bookmakerLogos:false,affiliateButtons:false,unknownAssets:false,[key]:true}}).status).toBe('blocked_for_review');
  });
});
describe('one source, three verified editorial exports',()=>{
  it('retains markets privately but never leaks them into platform metadata',()=>{
    const row=rankedFixture();row.odds.bookmakers=[{slug:'betsson',name:'Betsson'}];
    const pack=generatedContent(row,1,[row],testNow).content;
    expect(pack.socialSource?.operators[0].name).toBe('Betsson');
    for(const channel of VIDEO_CHANNELS){expect(draftCompliance(pack.platforms![channel]).status).toBe('ready');expect(JSON.stringify(pack.platforms![channel].social?.metadata)).not.toContain('Betsson');}
    expect(new Set(VIDEO_CHANNELS.map(c=>pack.platforms![c].caption)).size).toBe(3);
  });
  it('checks actual SVG layers, not merely captions, for every scene and cover',async()=>{
    const row=rankedFixture(),g=generatedContent(row,1,[row],testNow);
    for(const channel of VIDEO_CHANNELS){const draft=g.content.platforms![channel];
      const frames=await socialFrames(draft,g.fixture,{assetLoader:async()=>null,characterLoader:async()=>null,sceneryLoader:async()=>null});
      expect(frames).toHaveLength(4);
      for(const frame of frames){expect(frame).toContain('width="1080" height="1920"');expect(tiktokComplianceCheck({renderedText:[svgText(frame)]}).status).toBe('ready');expect(frame).not.toContain('COMPARAÇÃO 1 X 2');expect(frame).not.toContain('MONTA SEU BILHETE');}
      expect(svgText(frames[2])).toContain('classificação disponível');
    }
  });
  it('never substitutes invented form or H2H when facts are missing',()=>{
    const row=rankedFixture({standings:null}),pack=generatedContent(row).content;
    expect(pack.socialSource?.h2h).toBeNull();expect(pack.platforms!.TIKTOK.scenes[2].headline).toBe('Contexto da partida');
    expect(pack.platforms!.TIKTOK.caption).not.toMatch(/vitórias|forma recente|H2H/);
  });
  it('rejects a generic fallback before loading assets or synthesizing narration',async()=>{
    const row=rankedFixture(),loader=vi.fn(async()=>null),voice={id:'test',available:()=>true,synthesize:vi.fn()};
    await expect(renderSocialPackage(generateV11ContentPack(row).platforms!,fixtureSnapshot(row),{assetLoader:loader,voice})).rejects.toThrow('SOCIAL_BLOCKED_FOR_REVIEW');
    expect(loader).not.toHaveBeenCalled();expect(voice.synthesize).not.toHaveBeenCalled();
  });
  it('pins readiness to the content, video and cover, not a stale PASS flag',()=>{
    const item=publishingItem();expect(currentAssetReady(item,'TIKTOK')).toBe(true);
    item.content.platforms!.TIKTOK.social!.metadata={cta:'Compare as odds'};
    expect(socialExportReady(item,'TIKTOK')).toBe(false);expect(()=>postSnapshot(item,'TIKTOK')).toThrow('SOCIAL_BLOCKED_FOR_REVIEW');
    const changed=publishingItem();changed.platformAssets![0].sha256='c'.repeat(64);expect(socialExportReady(changed,'TIKTOK')).toBe(false);
    const legacy=publishingItem();legacy.content.assetModel='MASTER_V1';expect(currentAssetReady(legacy,'TIKTOK')).toBe(false);
  });
  it('allows narration timing adjustments but never text mutations in the proof identity',()=>{
    const d=publishingItem().content.platforms!.TIKTOK,before=socialDraftIdentity(d);d.scenes[0].durationSeconds+=1;
    expect(socialDraftIdentity(d)).toBe(before);d.scenes[0].subtitle='Different';expect(socialDraftIdentity(d)).not.toBe(before);
  });
  it('cannot persist a ready social item without three verified exports',async()=>{
    const row=rankedFixture(),g=generatedContent(row),transaction=vi.fn(),db={transaction} as unknown as DatabaseClient;
    await expect(persistGrowthItem(db,{...g,fixtureId:row.signals.fixtureId,trigger:'OWNER',priorityScore:0,scoreBreakdown:[],reasons:[],canonicalUrl:row.destinationUrl,now:testNow,force:false})).rejects.toThrow('SOCIAL_PACKAGE_INCOMPLETE');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('preserves exact-content proof verification after JSONB recursively reorders object keys',()=>{
    const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
    const item=publishingItem(),draft=item.content.platforms!.TIKTOK;
    const oldEncoding=JSON.stringify(reorder(JSON.parse(socialDraftIdentity(draft))));
    item.platformAssets![0].socialProof!.draftIdentity=oldEncoding;
    const stored=reorder(JSON.parse(JSON.stringify(item))) as typeof item;
    expect(matchesSocialDraftIdentity(stored.content.platforms!.TIKTOK,oldEncoding)).toBe(true);
    expect(socialMasterIdentity(stored.content.platforms!.TIKTOK)).toBe(socialMasterIdentity(draft));
    for(const channel of VIDEO_CHANNELS)expect(socialExportReady(stored,channel)).toBe(true);
    stored.content.platforms!.TIKTOK.scenes.reverse();
    expect(socialExportReady(stored,'TIKTOK')).toBe(false);
  });
  it('never treats malformed or changed proof content as a key-order-only difference',()=>{
    const draft=publishingItem().content.platforms!.TIKTOK,identity=socialDraftIdentity(draft);
    for(const bad of [null,{},'invalid','null','{}'])expect(matchesSocialDraftIdentity(draft,bad)).toBe(false);
    draft.caption+=' Outro contexto.';expect(matchesSocialDraftIdentity(draft,identity)).toBe(false);
  });
});
