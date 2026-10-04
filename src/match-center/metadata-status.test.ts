import {beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({load:vi.fn(),pending:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('./runtime',()=>({loadPublicMatchCenter:f.load}));
vi.mock('@/sports/runtime',()=>({loadPendingFixture:f.pending}));
vi.mock('@/seo-autopilot/public',()=>({readPublishedSeo:async()=>null,SeoFactualContext:()=>null}));
import {matchMetadata,MatchRoutePage} from './page';
import {englishMatchMetadata,EnglishMatchRoute} from '@/localization/english-routes';

const id='0123456789abcdef';
const header={id:'fixture',publicId:id,home:{name:'Home'},away:{name:'Away'},competition:'Premier League',
  competitionSlug:'premier-league',status:'SCHEDULED',kickoff:'2090-01-01T12:00:00Z'};
describe('entity validation in blocking match metadata',()=>{
  beforeEach(()=>{vi.clearAllMocks();f.pending.mockResolvedValue(null);f.load.mockResolvedValue({kind:'found',match:{header}});});
  const read=(locale:'br'|'mx'|'en',match:string)=>locale==='en'
    ?englishMatchMetadata(Promise.resolve({match}))
    :matchMetadata(Promise.resolve({match}),locale);
  it.each(['br','mx','en'] as const)('rejects malformed %s identities before metadata is emitted',async locale=>{
    await expect(read(locale,'invalid')).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
    expect(f.load).not.toHaveBeenCalled();
  });
  it.each(['br','mx','en'] as const)('rejects missing %s fixtures before metadata is emitted',async locale=>{
    f.load.mockResolvedValue({kind:'not-found'});
    await expect(read(locale,`home-x-away-${id}`)).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});
  });
  it.each([['br','jogo'],['mx','partido'],['en','match']] as const)('redirects a noncanonical %s slug once from the page, not twice from metadata',async(locale,segment)=>{
    for(const match of [`wrong-name-${id}`,`HOME-X-AWAY-${id.toUpperCase()}`]){
      const canonical=`/${locale}/${segment}/home-x-away-${id}`;
      await expect(read(locale,match)).resolves.toMatchObject({alternates:{canonical}});
      const params=Promise.resolve({match});
      await expect(locale==='en'?EnglishMatchRoute({params}):MatchRoutePage({params,locale}))
        .rejects.toMatchObject({digest:`NEXT_REDIRECT;replace;${canonical};308;`});
    }
  });
  it('preserves real canonical pending fixtures rather than turning them into 404s',async()=>{
    f.load.mockResolvedValue({kind:'not-found'});
    f.pending.mockResolvedValue({publicId:id,competitionSlug:'premier-league'});
    await expect(read('mx',`fixture-x-pending-${id}`)).resolves.toMatchObject({robots:{index:false,follow:true}});
  });
});
