import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {commercialCopy} from '@/components/commercial/AffiliateLink';
import {bookmakerShortName} from '@/slip/comparison-copy';
import {CREATIVE_ROLES,creativePromotion,inventoryCreative,inventoryDelivery} from './creative-inventory';
import {embedTrackingHost} from './embed-policy';
import {ROTATING_PLACEMENTS,rotatingChoice} from './service';
import {safeAffiliateDestination} from '@/odds/affiliate';
import {VISIBLE_BOOKMAKERS,bookmakerConfig} from '@/odds/registry';
import {primaryVisibleBookmakers} from '@/odds/fallback-pool';
import {publicLanguageNames,publicLanguages} from '@/localization/interface';
import type {Campaign} from './types';

/**
 * The commercial invariants that must hold whatever is activated: which operator may earn in which
 * jurisdiction, that a CTA names the operator it opens, that the one mobile slot is shared rather
 * than stacked, and that an operator without approved resources stays dark instead of guessing.
 */
describe('jurisdiction commercial eligibility',()=>{
  it('gives each GEO exactly its approved operators',()=>{
    expect(primaryVisibleBookmakers('MX')).toEqual(['betsson']);
    expect(primaryVisibleBookmakers('CO')).toEqual(['betsson','bwin']);
    expect(primaryVisibleBookmakers('PE')).toEqual(['inkabet','1xbet']);
  });
  it('never lets bwin earn outside Colombia',()=>{
    expect(bookmakerConfig('bwin')?.countries).toEqual(['CO']);
    for(const locale of ['mx','pe','br']){
      expect(creativePromotion('bwin',locale)).toBeNull();
      expect(inventoryDelivery('bwin',locale)).toBeNull();
      expect(embedTrackingHost('bwin',locale)).toBeNull();
    }
    // And no jurisdiction's destination allowlist accepts a bwin Colombia host.
    for(const locale of ['mx','pe','br'] as const)
      expect(safeAffiliateDestination('bwin',locale,'https://sports.bwin.co/x')).toBeNull();
  });
  it('keeps every other operator inside its own jurisdictions',()=>{
    expect(bookmakerConfig('inkabet')?.countries).toEqual(['PE']);
    expect(bookmakerConfig('1xbet')?.countries).toEqual(['PE']);
    expect(bookmakerConfig('betsson')?.countries).toEqual(['BR','MX','CO']);
    // Peru is deliberately not a Betsson commercial jurisdiction even though the feed identity lists BR.
    expect(creativePromotion('betsson','pe')).toBeNull();
    expect(creativePromotion('inkabet','co')).toBeNull();
    expect(creativePromotion('1xbet','co')).toBeNull();
    expect(creativePromotion('1xbet','mx')).toBeNull();
  });
  it('keeps Brazil and the rest of the world commercially dark',()=>{
    for(const operator of ['betsson','bwin','inkabet','1xbet'])
      expect(creativePromotion(operator,'br')).toBeNull();
  });
});

describe('bwin Colombia stays fail-closed until Entain provisions resources',()=>{
  it('has no approved creative inventory, so no banner can resolve',()=>{
    expect(creativePromotion('bwin','co')).toBeNull();
    expect(inventoryDelivery('bwin','co')).toBeNull();
    for(const role of CREATIVE_ROLES)
      expect(inventoryCreative('bwin','co',role,'https://c.bannerflow.net/a/'+'a'.repeat(24)+'?media=1')).toBeNull();
  });
  it('has no publisher tracking host, so no embed contract can accept it',()=>{
    expect(embedTrackingHost('bwin','co')).toBeNull();
  });
  it('still keeps its Colombian odds destination allowlisted for when a tracker exists',()=>{
    // Odds and the operator identity are live; only the commercial resources are missing, so the
    // jurisdiction allowlist stays in place and activation is a configuration step, not a rebuild.
    expect(safeAffiliateDestination('bwin','co','https://sports.bwin.co/x')).toBe('https://sports.bwin.co/x');
    expect(bookmakerConfig('bwin')?.displayRole).toBe('VISIBLE_PRIMARY');
  });
});

describe('the single mobile slot is shared, never stacked',()=>{
  const campaign=(bookmaker:string,id=bookmaker):{campaign:Campaign}=>({campaign:{id,bookmaker,locale:'co'} as Campaign});
  it('rotates only the one mobile placement',()=>{
    expect([...ROTATING_PLACEMENTS]).toEqual(['mobile_inline']);
    for(const p of ['home_top_banner','home_right_rail','match_top_banner','match_right_rail'])
      expect(rotatingChoice(p,[campaign('betsson'),campaign('bwin')],0)).toBeNull();
  });
  it('is deterministic: the same window always yields the same operator',()=>{
    const pair=[campaign('betsson'),campaign('bwin')];
    const at=(ms:number)=>rotatingChoice('mobile_inline',pair,ms,undefined,10)?.campaign.bookmaker;
    for(let i=0;i<5;i++)expect(at(0)).toBe(at(0));
    // Ten-minute windows alternate, and order follows the registry, never commission.
    expect(at(0)).toBe('betsson');
    expect(at(10*60000)).toBe('bwin');
    expect(at(20*60000)).toBe('betsson');
    // Input order cannot change the result.
    expect(rotatingChoice('mobile_inline',[...pair].reverse(),0,undefined,10)?.campaign.bookmaker).toBe('betsson');
  });
  it('never shows two operators at once, and falls back to a single eligible operator',()=>{
    expect(rotatingChoice('mobile_inline',[campaign('betsson')],0)).toBeNull();
    // One operator with two campaigns is ambiguous configuration, not a rotation.
    expect(rotatingChoice('mobile_inline',[campaign('betsson','a'),campaign('betsson','b')],0)).toBeNull();
  });
  it('honours the operator a signed offer was issued for across a window boundary',()=>{
    const pair=[campaign('betsson'),campaign('bwin')];
    // Issued in the Betsson window, re-resolved in the bwin window: still Betsson.
    expect(rotatingChoice('mobile_inline',pair,10*60000,'betsson',10)?.campaign.bookmaker).toBe('betsson');
    expect(rotatingChoice('mobile_inline',pair,0,'bwin',10)?.campaign.bookmaker).toBe('bwin');
  });
});

describe('an affiliate CTA names the operator it opens',()=>{
  it('offers operator-named wording in every public language',()=>{
    expect(commercialCopy.mx.ctaAt('Betsson')).toBe('Ver cuotas en Betsson');
    expect(commercialCopy.co.ctaAt('bwin')).toBe('Ver cuotas en bwin');
    expect(commercialCopy.pe.ctaAt('1xBet')).toBe('Ver cuotas en 1xBet');
    expect(commercialCopy.br.ctaAt('Betsson')).toBe('Ver odds na Betsson');
    expect(commercialCopy.en.ctaAt('Inkabet')).toBe('View odds at Inkabet');
  });
  it('uses each operator short label, so no CTA says the wrong brand',()=>{
    for(const book of VISIBLE_BOOKMAKERS){
      const name=bookmakerShortName(book.canonicalId,book.displayName);
      expect(name).toBe(book.shortLabel);
      expect(commercialCopy.mx.ctaAt(name)).toContain(name);
    }
  });
  it('makes no offer or bonus claim',()=>{
    for(const locale of ['br','mx','co','pe','en'] as const){
      const text=commercialCopy[locale].ctaAt('Betsson');
      expect(text).not.toMatch(/bono|bônus|bonus|free|gratis|grátis|%|\$/i);
    }
  });
  it('is wired into the match odds table, not only the slip',()=>{
    const odds=readFileSync('src/components/match/PregameOdds.tsx','utf8');
    expect(odds).toContain('ctaAt(bookmakerShortName(row.bookmaker,row.name))');
    expect(odds).toContain("placement:'match_odds_table'");
    const slip=readFileSync('src/components/slip/SlipComparison.tsx','utf8');
    expect(slip).toContain('text.ctaAt(bookName)');
  });
});

describe('every public bookmaker keeps an official logo',()=>{
  it('ships an image asset rather than a text fallback',()=>{
    for(const book of VISIBLE_BOOKMAKERS){
      expect(book.logoAsset,`${book.canonicalId} logo`).toMatch(/^\/bookmakers\/.+\.(webp|png|svg)$/);
      expect(()=>readFileSync('public'+book.logoAsset!)).not.toThrow();
    }
  });
});

describe('the retired public growth box stays retired',()=>{
  it('no longer renders the standalone five-card block',()=>{
    const board=readFileSync('src/components/sports/SportsBoardPage.tsx','utf8');
    expect(board).not.toMatch(/Partidos para seguir|Matches to follow|Partidas para seguir/);
  });
});

describe('the public language menu offers languages, never jurisdictions',()=>{
  it('lists exactly the three supported languages',()=>{
    expect([...publicLanguages]).toEqual(['es','pt','en']);
    expect(Object.values(publicLanguageNames)).toEqual(['Español','Português','English']);
    // A jurisdiction must never be selectable as a language: GEO comes from the trusted edge only.
    for(const geo of ['México','Colombia','Perú','Brasil','Mexico','Peru','Brazil'])
      expect(Object.values(publicLanguageNames as Record<string,string>)).not.toContain(geo);
  });
  it('keeps the selector driven by that list rather than hard-coded names',()=>{
    const selector=readFileSync('src/localization/LanguageSelector.tsx','utf8');
    expect(selector).toContain('publicLanguages.map');
    expect(selector).toContain('publicLanguageNames[value]');
  });
});
