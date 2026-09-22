import {describe,expect,it} from 'vitest';
import {contentSourceHash,formatBrazilKickoff,generateContentPack} from './content';
import {rankedFixture} from './fixtures.test-support';

describe('Traffic Engine V1 PT-BR content',()=>{
  it('formats kickoff in Brazil and writes only supplied factual context',()=>{
    const row=rankedFixture(),content=generateContentPack(row);
    expect(formatBrazilKickoff(row.signals.kickoff)).toContain('15:00');
    expect(content.locale).toBe('pt-BR');expect(content.script).toContain('horário de Brasília');expect(content.script).toContain('Compare as odds no LivaSports');
    expect(JSON.stringify(content)).not.toMatch(/palpite|les[aã]o|transmiss[aã]o|escala[cç][aã]o|favorito para vencer/i);
  });
  it('handles missing optional data and does not claim odds when none exist',()=>{
    const row=rankedFixture({oddsBookmakers:0,standings:null,venue:null,stageName:null,roundName:null});
    const content=generateContentPack(row);expect(content.script).toContain('ainda não estão disponíveis');expect(content.cta).toContain('Acompanhe os dados');
    expect(content.facts.some(fact=>fact.label==='Tabela')).toBe(false);
  });
  it('keeps long team names intact and hashes the same snapshot deterministically',()=>{
    const row=rankedFixture({home:{slug:'associacao-desportiva-ferroviaria',name:'Associação Desportiva Ferroviária do Vale',publicId:'a'.repeat(16),imageUrl:null}});
    expect(generateContentPack(row).headline).toContain('Associação Desportiva Ferroviária do Vale');
    expect(contentSourceHash(row)).toBe(contentSourceHash(structuredClone(row)));expect(contentSourceHash(row)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('produces a 15–30 second screen plan and all four channel captions',()=>{
    const content=generateContentPack(rankedFixture());
    expect(content.screens.reduce((sum,screen)=>sum+screen.durationSeconds,0)).toBeGreaterThanOrEqual(15);
    expect(content.screens.reduce((sum,screen)=>sum+screen.durationSeconds,0)).toBeLessThanOrEqual(30);
    expect(Object.keys(content.captions).sort()).toEqual(['EDITORIAL','INSTAGRAM_REELS','TIKTOK','YOUTUBE_SHORTS']);
  });
});
