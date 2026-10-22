import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {previewNews} from './seed';
import {contextScene,ContextScene} from './ContextScene';
const item={...previewNews[0],image:'none' as const,sport:'football' as const,country:'co' as const,competition:'copa-colombia' as const,title:{en:'América de Cali qualifies',es:'América de Cali clasifica',pt:'América de Cali se classifica'}};
describe('licensed archive context, never event evidence',()=>{
 it('uses Cali only for the identified club and competition',()=>{
  expect(contextScene(item)?.id).toBe('cali-archive');
  expect(contextScene({...item,title:{en:'Another club',es:'Otro club',pt:'Outro clube'}})?.id).toBe('campin');
  expect(contextScene({...item,country:'mx'})?.id).not.toBe('cali-archive');
 });
 it.each(['en','mx','br'] as const)('retains archive date, attribution and license in %s',locale=>{
  const html=renderToStaticMarkup(<ContextScene item={item} locale={locale}/>);
  expect(html).toContain('2023');expect(html).toContain('creativecommons.org/licenses/by-sa/4.0');
  expect(html).toContain('DAVIDHC0520');expect(html).toContain('Pascual Guerrero');
 });
 it('does not replace an existing authorized editorial image',()=>{expect(contextScene({...item,image:'campin'})).toBeNull();});
});
