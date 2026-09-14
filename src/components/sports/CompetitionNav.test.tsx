import {describe,expect,it,vi} from 'vitest';
vi.mock('next/link',()=>({default:({href,children,...props}:{href:string;children:import('react').ReactNode})=> <a href={href} {...props}>{children}</a>}));
import {renderToStaticMarkup} from 'react-dom/server';
import {CompetitionNav} from './CompetitionNav';

describe('competition navigation',()=>{
  const items=[
    {slug:'brasileirao-serie-a',name:'Brasileirão Série A',group:'BRAZIL',count:1},
    {slug:'copa-do-brasil',name:'Copa do Brasil',group:'BRAZIL',count:0},
    {slug:'liga-mx',name:'Liga MX',group:'AMERICAS',count:2},
    {slug:'premier-league',name:'Premier League',group:'EUROPE',count:1},
  ];
  it('keeps flags, names and counts as separate elements and links to the competition hub',()=>{
    const html=renderToStaticMarkup(<CompetitionNav locale="br" items={items} activeSlug="liga-mx" allHref="/br/futebol" allLabel="Todas" title="Competições"/>);
    expect(html).toContain('🇧🇷');
    expect(html).toContain('🇲🇽');
    expect(html).toContain('class="competition-nav-name">Brasileirão Série A');
    expect(html).toContain('class="competition-nav-count">1');
    expect(html).not.toContain('Brasileirão Série A1');
    expect(html).not.toContain('Liga MX2');
    expect(html).toContain('href="/br/futebol?competition=premier-league"');
    expect(html).toContain('aria-label="Premier League, 1"');
    expect(html).toContain('href="/br/futebol?competition=liga-mx"');
    expect(html).not.toContain('#competition-');
    expect(html).toContain('Copa do Brasil');
    expect(html).toContain('class="competition-nav-control"');
    expect(html).toContain('>Competições</label>');
    expect(html).toContain('id="competition-nav-toggle"');
    expect(html).toContain('id="competition-nav-panel"');
    expect(html).toContain('aria-controls="competition-nav-panel"');
    expect(html).not.toContain('checked');
  });
});
