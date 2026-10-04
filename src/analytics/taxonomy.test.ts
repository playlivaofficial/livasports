import {describe,it,expect} from 'vitest';
import {CLIENT_EVENTS,EVENT_NAMES,EVENT_VERSION,SERVER_EVENTS,classifyPage,classifyReferrer,legBucket,parseClientEvent,parseUtm} from './taxonomy';

const base={eventId:'11111111-1111-4111-8111-111111111111',eventName:'page_viewed',eventVersion:1,occurredAt:'2026-09-18T12:00:00.000Z',sessionId:'s'.repeat(24),anonymousId:'a'.repeat(24),
  locale:'br',pageType:'match',canonicalPath:'/br/jogo/x-0123456789abcdef',referrerClass:'google_organic',utm:{source:'newsletter'}};
describe('P4 event taxonomy and contract (§3, §4, §33)',()=>{
  it('is typed and versioned: 25 client events including market intent + 6 server-only events, version 1',()=>{
    expect(EVENT_VERSION).toBe(1);expect(CLIENT_EVENTS).toHaveLength(25);expect(SERVER_EVENTS).toHaveLength(6);expect(new Set(EVENT_NAMES).size).toBe(31);
    expect(CLIENT_EVENTS).toContain('market_open');
    for(const required of ['session_started','landing_viewed','page_viewed','competition_viewed','team_viewed','player_viewed','match_viewed','search_used','odds_visible','odds_selected','bookmaker_comparison_viewed',
      'slip_created','slip_leg_added','slip_leg_removed','slip_cleared','stake_changed','slip_opened','affiliate_cta_viewed','affiliate_cta_clicked','outbound_redirect_completed','sign_in_started','sign_in_completed','sign_out_completed',
      'favorite_added','favorite_removed','my_matches_viewed','returning_session_started'])expect(EVENT_NAMES).toContain(required);
  });
  it('accepts a valid event and normalizes entity identifiers',()=>{
    const e=parseClientEvent({...base,eventName:'odds_selected',fixturePublicId:'0123456789ABCDEF',bookmaker:'betsson',market:'MATCH_WINNER',outcome:'HOME',priceKind:'REAL',slipLegCount:2,props:{method:'tap'}});
    expect(e).toMatchObject({eventName:'odds_selected',fixturePublicId:'0123456789abcdef',bookmaker:'betsson',market:'MATCH_WINNER',outcome:'HOME',priceKind:'REAL',slipLegCount:2,props:{method:'tap'},utm:{source:'newsletter'}});
  });
  it('accepts the three independent locale routes and candidate operator identities without granting commercial eligibility',()=>{
    for(const [locale,bookmaker] of [['mx','caliente'],['co','betplay'],['pe','bet365']]){
      expect(parseClientEvent({...base,locale,eventName:'market_open',bookmaker,canonicalPath:`/${locale}/partido/x-0123456789abcdef`}))
        .toMatchObject({locale,eventName:'market_open',bookmaker});
      expect(classifyPage(`/${locale}/partido/x-0123456789abcdef`)).toMatchObject({locale,pageType:'match',fixturePublicId:'0123456789abcdef'});
    }
    expect(parseClientEvent({...base,locale:'es'})).toBeNull();
    expect(parseClientEvent({...base,bookmaker:'unknown-bookie'})).toMatchObject({bookmaker:undefined});
  });
  it('rejects unknown events, server-only events sent by a client, bad versions, invalid ids and oversized payloads',()=>{
    expect(parseClientEvent({...base,eventName:'hover_noise'})).toBeNull();
    expect(parseClientEvent({...base,eventName:'sign_in_completed'})).toBeNull();
    expect(parseClientEvent({...base,eventVersion:2})).toBeNull();
    expect(parseClientEvent({...base,eventId:'not-a-uuid'})).toBeNull();
    expect(parseClientEvent({...base,sessionId:'short'})).toBeNull();
    expect(parseClientEvent({...base,pageType:'admin'})).toBeNull();
    expect(parseClientEvent({...base,canonicalPath:'https://evil.example/'})).toBeNull();
    expect(parseClientEvent({...base,props:{note:'x'.repeat(3000)}})).toBeNull();
    expect(parseClientEvent({...base,fixturePublicId:'zzz'})).toMatchObject({fixturePublicId:undefined});
    expect(parseClientEvent({...base,slipLegCount:99})).toMatchObject({slipLegCount:undefined});
  });
  it('rejects secrets, tokens and e-mail addresses anywhere in the payload',()=>{
    expect(parseClientEvent({...base,token:'abc'})).toBeNull();
    expect(parseClientEvent({...base,props:{authorization:'Bearer x'}})).toBeNull();
    expect(parseClientEvent({...base,props:{note:'contact me at someone@example.com'}})).toBeNull();
    expect(parseClientEvent({...base,utm:{campaign:'magic-link-token'}})).toMatchObject({utm:{campaign:undefined}});
  });
  it('classifies pages from the localized route tables and extracts entity ids',()=>{
    expect(classifyPage('/en')).toMatchObject({pageType:'home',locale:'en'});
    expect(classifyPage('/br/futebol','?competition=la-liga-2')).toMatchObject({pageType:'competition',competitionSlug:'la-liga-2'});
    expect(classifyPage('/mx/futbol')).toMatchObject({pageType:'football',locale:'mx'});
    expect(classifyPage('/br/jogo/bayern-x-union-b383489fbdeb4ef1')).toMatchObject({pageType:'match',fixturePublicId:'b383489fbdeb4ef1'});
    expect(classifyPage('/en/match/bayern-v-union-B383489FBDEB4EF1')).toMatchObject({pageType:'match',fixturePublicId:'b383489fbdeb4ef1'});
    expect(classifyPage('/mx/equipo/club-0123456789abcdef')).toMatchObject({pageType:'team',teamPublicId:'0123456789abcdef'});
    expect(classifyPage('/br/jogador/nome-0123456789abcdef')).toMatchObject({pageType:'player'});
    expect(classifyPage('/en/my-matches')).toMatchObject({pageType:'my_matches'});expect(classifyPage('/mx/iniciar-sesion')).toMatchObject({pageType:'sign_in'});
    expect(classifyPage('/en/how-odds-comparison-works')).toMatchObject({pageType:'help'});expect(classifyPage('/br/privacidade')).toMatchObject({pageType:'legal'});
    expect(classifyPage('/owner/health')).toMatchObject({pageType:'owner'});expect(classifyPage('/sitemap.xml')).toMatchObject({pageType:'other',locale:null});
  });
  it('classifies acquisition: Google, Bing, direct, social, referral, internal and UTM overrides (§7, §35)',()=>{
    expect(classifyReferrer('https://www.google.com/','livasports.com')).toMatchObject({referrerClass:'google_organic'});
    expect(classifyReferrer('https://www.bing.com/search?q=x','livasports.com')).toMatchObject({referrerClass:'bing_organic'});
    expect(classifyReferrer('','livasports.com')).toMatchObject({referrerClass:'direct'});
    expect(classifyReferrer('https://t.co/abc','livasports.com')).toMatchObject({referrerClass:'social',referrerHost:'t.co'});
    expect(classifyReferrer('https://news.example.org/post','livasports.com')).toMatchObject({referrerClass:'referral',referrerHost:'news.example.org'});
    expect(classifyReferrer('https://livasports.com/br','livasports.com')).toMatchObject({referrerClass:'internal'});
    expect(classifyReferrer('https://www.google.com/','livasports.com','cpc','google')).toMatchObject({referrerClass:'paid'});
    expect(classifyReferrer(null,'livasports.com',undefined,'partner-site')).toMatchObject({referrerClass:'referral'});
    expect(parseUtm('?utm_source=Newsletter&utm_medium=Email&utm_campaign=Opening&x=1')).toEqual({source:'newsletter',medium:'email',campaign:'opening',content:undefined,term:undefined});
    expect([1,2,3,4,5,9,0].map(legBucket)).toEqual(['1','2','3','4','5+','5+','0']);
  });
});
