import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {StoryContext} from './StoryContext';
import {previewNews} from './seed';
import type {SportsSnapshot} from '@/multisport/model';
const snapshot={competitionId:'nfl',sport:'american-football',sourceId:'wikimedia',season:'2026',observedAt:'2026-10-18T20:11:21Z',entities:[],events:[],tables:[],observationBasis:'source-revision'} as unknown as SportsSnapshot;
const story={...previewNews[0],sport:'american-football' as const,competition:'nfl' as const};
describe('article snapshot dates',()=>{
 it('uses a compact single-team context instead of an empty matchup column',()=>{const html=renderToStaticMarkup(<StoryContext story={{...story,title:{en:'Arizona Cardinals announcement',es:'Arizona Cardinals anuncio',pt:'Arizona Cardinals anúncio'}}} snapshots={[{...snapshot,entities:[{id:'synthetic-cardinals',kind:'club',name:'Arizona Cardinals'}]}]} locale="en"/>);expect(html).toContain('ed-single-identity');expect(html).toContain('Arizona Cardinals');});
 it.each([['en','results cutoff unconfirmed'],['mx','corte de resultados sin confirmar'],['br','corte dos resultados não confirmado']] as const)('never promotes an edit timestamp to a result cutoff in %s',(locale,label)=>{const html=renderToStaticMarkup(<StoryContext story={story} snapshots={[snapshot]} locale={locale}/>);expect(html).toContain(label);expect(html).toContain('2026-10-18');});
 it('retains a verified actual data date',()=>{const html=renderToStaticMarkup(<StoryContext story={story} snapshots={[{...snapshot,observationBasis:'data-date'}]} locale="en"/>);expect(html).toContain('Data cutoff');expect(html).not.toContain('unconfirmed');});
});
