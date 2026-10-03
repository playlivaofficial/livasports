import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('server-only',()=>({}));
import {GrowthPriorityCounts,GrowthQueue} from './GrowthQueue';
import {rankedFixture,testNow} from './fixtures.test-support';
import type {GrowthDashboard} from './types';
import type {CoreGeo} from '@/config/geo';

function dashboard(geo:CoreGeo='CO'):GrowthDashboard{
  const content=Array.from({length:5},(_,index)=>({...rankedFixture({fixtureId:`fixture-${index}`,publicId:String(index).padStart(16,'0')}),geo}));
  return {geo,content,social:content,items:[],considered:40,producible:12,generatedAt:testNow.toISOString(),
    selection:{selectedAt:testNow.toISOString(),current:[...content.slice(0,3).map((row,index)=>({fixtureId:row.signals.fixtureId,rank:index+1,score:50,label:'Selected'})),
      {fixtureId:'expired-fixture',rank:4,score:55,label:'No longer eligible'}],previous:[],rotations:[]},
    publishing:{posts:[],total:90,today:3,last7Days:20,byPlatform:{TIKTOK:30,INSTAGRAM_REELS:30,YOUTUBE_SHORTS:30}}};
}
describe('selected-GEO priority summary',()=>{
  it.each(['MX','CO','PE'] as const)('counts five fixtures, not fifteen publication slots, for %s',geo=>{
    const html=renderToStaticMarkup(<GrowthPriorityCounts dashboard={dashboard(geo)}/>);
    expect(html).toContain(`Prioridades actuales · ${geo}`);
    expect(html).toContain(`<span>Top 5 actual · ${geo}</span><strong>5 / 5</strong>`);
    expect(html).toContain(`<span>SEO activo · ${geo}</span><strong>3</strong>`);
    expect(html).toContain(`<span>Candidatos elegibles · ${geo}</span><strong>12</strong>`);
    expect(html).toContain('40 partidos evaluados');expect(html).toContain('Desactivada');
    expect(html).not.toMatch(/publicados|postar|Brasília|90|15/);
  });
  it('shows empty or unpersisted selection honestly without borrowing historical posts',()=>{
    const data=dashboard();data.content=[];data.social=[];data.selection=null;data.producible=0;
    const html=renderToStaticMarkup(<GrowthPriorityCounts dashboard={data}/>);
    expect(html).toContain('<strong>0 / 5</strong>');expect(html).toContain('<span>SEO activo · CO</span><strong>0</strong>');
    expect(html).not.toContain('90');
  });
  it('clearly separates global historical posting data from the active Spanish GEO queue',()=>{
    const html=renderToStaticMarkup(<GrowthQueue dashboard={dashboard()}/>);
    expect(html).toContain('Publicaciones históricas · todos los GEO, incluido BR');
    expect(html).toContain('Total histórico: 90 registros');
    expect(html).toContain('estos totales no miden la selección actual');
    expect(html).toContain('Prioridad seleccionada para descubrimiento y SEO.');
    expect(html).toContain('Top 5 · CO');
    expect(html).not.toContain('Top 5 social');expect(html).not.toContain('prontos para postar');
    expect(html).not.toContain('Oportunidade selecionada');expect(html).not.toContain('Top 5 · publicados');
  });
});
