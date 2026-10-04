import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({load:vi.fn(),pending:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('./runtime',()=>({loadPublicMatchCenter:f.load}));
vi.mock('@/sports/runtime',()=>({loadPendingFixture:f.pending}));
vi.mock('@/seo-autopilot/public',async()=>{
  const {languageAlternates}=await import('@/localization/interface');
  return {readPublishedSeo:async()=>null,SeoFactualContext:()=>null,
    matchLanguageAlternates:async(_id:string,_status:string,_kickoff:string,br:string,mx:string,en:string)=>languageAlternates(br,mx,en)};
});
import {matchMetadata,MatchRoutePage} from './page';
import {englishMatchMetadata,EnglishMatchRoute} from '@/localization/english-routes';

const id='0123456789abcdef';
const header={id:'fixture',publicId:id,home:{name:'Home'},away:{name:'Away'},competition:'Premier League',
  competitionSlug:'premier-league',status:'SCHEDULED',kickoff:'2090-01-01T12:00:00Z'};
describe('entity validation in blocking match metadata',()=>{
  beforeEach(()=>{vi.clearAllMocks();f.pending.mockResolvedValue(null);f.load.mockResolvedValue({kind:'found',match:{header}});});
  const read=(locale:'br'|'mx'|'co'|'pe'|'en',match:string)=>locale==='en'
    ?englishMatchMetadata(Promise.resolve({match}))
    :matchMetadata(Promise.resolve({match}),locale);
  it.each(['br','mx','co','pe','en'] as const)('rejects malformed %s identities before metadata is emitted',async locale=>{
    await expect(read(locale,'invalid')).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
    expect(f.load).not.toHaveBeenCalled();
  });
  it.each(['br','mx','co','pe','en'] as const)('rejects missing %s fixtures before metadata is emitted',async locale=>{
    f.load.mockResolvedValue({kind:'not-found'});
    await expect(read(locale,`home-x-away-${id}`)).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
  });
  it.each([['br','jogo'],['mx','partido'],['co','partido'],['pe','partido'],['en','match']] as const)('redirects a noncanonical %s slug once from the page, not twice from metadata',async(locale,segment)=>{
    for(const match of [`wrong-name-${id}`,`HOME-X-AWAY-${id.toUpperCase()}`]){
      const canonical=`/${locale}/${segment}/home-x-away-${id}`;
      await expect(read(locale,match)).resolves.toMatchObject({alternates:{canonical}});
      const params=Promise.resolve({match});
      await expect(locale==='en'?EnglishMatchRoute({params}):MatchRoutePage({params,locale}))
        .rejects.toMatchObject({digest:`NEXT_REDIRECT;replace;${canonical};308;`});
    }
  });
  it.each(['mx','co','pe'] as const)('keeps the %s canonical and full reciprocal GEO hreflang cluster',async locale=>{
    const tail=`home-x-away-${id}`;
    await expect(read(locale,tail)).resolves.toMatchObject({alternates:{canonical:`/${locale}/partido/${tail}`,languages:{
      'pt-BR':`/br/jogo/${tail}`,'es-MX':`/mx/partido/${tail}`,'es-CO':`/co/partido/${tail}`,
      'es-PE':`/pe/partido/${tail}`,en:`/en/match/${tail}`,'x-default':`/en/match/${tail}`,
    }}});
  });
  it('preserves real canonical pending fixtures rather than turning them into 404s',async()=>{
    f.load.mockResolvedValue({kind:'not-found'});
    f.pending.mockResolvedValue({publicId:id,competitionSlug:'premier-league'});
    await expect(read('mx',`fixture-x-pending-${id}`)).resolves.toMatchObject({robots:{index:false,follow:true}});
  });
});
