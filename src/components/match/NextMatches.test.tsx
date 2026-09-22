import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextMatches} from './NextMatches';
import type {NextMatchView} from '@/match-center/types';

const fixture=(over:Partial<NextMatchView>={}):NextMatchView=>({publicId:'0123456789abcdef',kickoff:'2026-10-01T19:00:00.000Z',
  competition:'Liga MX',competitionSlug:'liga-mx',relation:'TEAM',
  home:{publicId:'1123456789abcdef',name:'Home'},away:{publicId:'2123456789abcdef',name:'Away'},...over});

describe('M1 next-match block',()=>{
  it('renders nothing rather than an empty panel when there is no upcoming inventory',()=>{
    expect(renderToStaticMarkup(<NextMatches locale="br" matches={[]}/>)).toBe('');
    expect(renderToStaticMarkup(<NextMatches locale="br" matches={undefined}/>)).toBe('');
  });
  it('links the upcoming fixture and the canonical competition hub in every locale',()=>{
    for(const [locale,heading,path] of [['br','Próximos jogos','/br/jogo/'],['mx','Próximos partidos','/mx/partido/'],['en','Upcoming matches','/en/match/']] as const){
      const html=renderToStaticMarkup(<NextMatches locale={locale} matches={[fixture()]}/>);
      expect(html).toContain(heading);
      expect(html).toContain(path);
      expect(html).toContain('competition=liga-mx');
      // The hub link must be the canonical one, never a default-season twin.
      expect(html).not.toContain('season=');
    }
  });
  it('says truthfully why each fixture was chosen',()=>{
    expect(renderToStaticMarkup(<NextMatches locale="br" matches={[fixture({relation:'TEAM'})]}/>)).toContain('Time desta partida');
    expect(renderToStaticMarkup(<NextMatches locale="br" matches={[fixture({relation:'COMPETITION'})]}/>)).toContain('Mesma competição');
    expect(renderToStaticMarkup(<NextMatches locale="en" matches={[fixture({relation:'COMPETITION'})]}/>)).toContain('Same competition');
  });
  it('carries a machine-readable kickoff so the date is never ambiguous',()=>{
    expect(renderToStaticMarkup(<NextMatches locale="en" matches={[fixture()]}/>)).toMatch(/datetime="2026-10-01T19:00:00\.000Z"/i);
  });
  it('stays a compact navigation block rather than a new feature',()=>{
    const html=renderToStaticMarkup(<NextMatches locale="en" matches={[fixture(),fixture({publicId:'aaaaaaaaaaaaaaaa'}),fixture({publicId:'bbbbbbbbbbbbbbbb'})]}/>);
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).not.toMatch(/<form|<button|<img/);
    expect(html).toContain('match-panel');
  });
});
