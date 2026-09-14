import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {EventPeople} from './EventPeople';
import type {MatchEventView} from '@/match-center/types';

const event:MatchEventView={id:'event',type:'Substitution',periodId:null,minute:49,extraMinute:null,teamId:null,playerName:'Incoming player',relatedPlayerName:'Outgoing player',result:null,playerPublicId:'incoming',relatedPlayerPublicId:null,detail:null,rescinded:false};
describe('official event participant roles',()=>{
  it.each([['br','Entra','Sai'],['mx','Entra','Sale'],['en','On','Off']] as const)('labels incoming and outgoing players in %s without inventing profile links', (locale,on,off)=>{
    const html=renderToStaticMarkup(<EventPeople locale={locale} event={event}/>);
    expect(html).toContain(`${on}: <a`);expect(html).toContain(`${off}: Outgoing player`);
    expect(html.match(/<a /g)).toHaveLength(1);
  });
  it('keeps a missing incoming player unknown and does not reverse the outgoing player',()=>{
    const html=renderToStaticMarkup(<EventPeople locale="en" event={{...event,playerName:null}}/>);
    expect(html).toContain('Off: Outgoing player');expect(html).not.toContain('On:');expect(html).not.toContain(' · ');
  });
  it('labels a supplied goal assist but does not invent an assist on an own goal',()=>{
    const goal={...event,type:'Goal',result:'1-0'};
    expect(renderToStaticMarkup(<EventPeople locale="en" event={goal}/>)).toContain('Assist: Outgoing player');
    expect(renderToStaticMarkup(<EventPeople locale="en" event={{...goal,type:'Own Goal'}}/>)).not.toContain('Assist:');
  });
});
