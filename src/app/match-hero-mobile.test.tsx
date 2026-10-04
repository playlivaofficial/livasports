import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {TeamIdentity} from '@/components/sports/FixtureCard';

describe('narrow match hero keeps localized kickoff separate from full team identities',()=>{
  const css=readFileSync('src/app/visual-system.css','utf8');
  const mobileStart=css.search(/@media\s*\(max-width:\s*620px\)/);
  const mobile=css.slice(mobileStart);
  it('lets the scheduled kickoff wrap inside its center grid track without changing desktop typography',()=>{
    expect(mobile).toContain('.match-score { min-width: 0; }');
    expect(mobile).toContain('.match-score>* { max-width: 100%; overflow-wrap: anywhere; }');
    expect(mobile).toContain('.match-score.is-scheduled strong { font-size: 1.2rem; line-height: 1.25; white-space: normal; }');
    expect(css.slice(0,mobileStart)).toContain('.match-score.is-scheduled strong { font-size: 3.15rem; }');
    expect(mobile).toContain('.match-score strong { font-size: 2.3rem; }');
  });
  it('preserves both complete 60-character names and full localized time text',()=>{
    const home='Club Deportivo QA '.padEnd(60,'A'),away='Asociación QA '.padEnd(60,'B');
    const html=renderToStaticMarkup(<div className="match-scoreboard">
      <div className="match-team"><TeamIdentity name={home} shortName="QA" size={80}/></div>
      <div className="match-score is-scheduled"><strong>04:41 a. m.</strong><time dateTime="2026-10-04T09:41:00Z">4 de octubre de 2026</time><small>America/Bogota</small></div>
      <div className="match-team is-away"><TeamIdentity name={away} shortName="QA" size={80}/></div>
    </div>);
    expect(home).toHaveLength(60);expect(away).toHaveLength(60);
    expect(html).toContain(`<span class="team-name">${home}</span>`);expect(html).toContain(`<span class="team-name">${away}</span>`);
    expect(html).toContain('04:41 a. m.');expect(html).toContain('America/Bogota');
    expect(mobile).toContain('.match-team .team-name { font-size: .83rem; line-height: 1.4; overflow: visible; text-overflow: clip; }');
  });
});
