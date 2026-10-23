import {describe,it,expect} from 'vitest';
import {getWikimediaDataset,type WikimediaBatch} from './wikimedia';
import {normalizeWikimediaSports} from './wikimedia-football';
const now=new Date('2026-10-22T12:00:00Z');
function fixture():WikimediaBatch{
 const codes=Array.from({length:20},(_,i)=>'A'+String.fromCharCode(65+i));
 const block=`<section begin="Finalización" />{{#invoke:Sports table|main|style=WDL\n|section=Finalización\n|update=21 October 2026\n|team_order=${codes.join(',')}\n${codes.map((c,i)=>`|name_${c}=[[Synthetic Club ${i}]]\n|win_${c}=2|draw_${c}=3|loss_${c}=2|gf_${c}=5|ga_${c}=5`).join('\n')}\n}}<section end="Finalización" />`;
 return {dataset:getWikimediaDataset('colombia-primera-a'),retrievedAt:now.toISOString(),sourceSha256:null,pages:[{title:'2026 Liga DIMAYOR',revisionId:1,revisionTimestamp:'2026-10-22T03:00:00Z',wikitext:'Apertura and aggregate are not imported.\n'+block}]};
}
describe('review-only Colombia Finalización import',()=>{
 it('isolates the explicit stage with source date, twenty teams and no invented fixtures',()=>{const s=normalizeWikimediaSports(fixture(),now).snapshot;expect(s.entities).toHaveLength(20);expect(s.observedAt).toBe('2026-10-21');expect(s.mode).toBe('manual');expect(s.events).toEqual([]);expect(s.stage).toBe('Torneo Finalización');});
 it.each(['Finalización','Apertura'])('rejects ambiguous or missing stage %s',stage=>{const b=fixture();b.pages[0].wikitext=stage==='Finalización'?b.pages[0].wikitext.repeat(2):b.pages[0].wikitext.replaceAll('Finalización','Apertura');expect(()=>normalizeWikimediaSports(b,now)).toThrow('UNREVIEWED_FORMAT');});
 it('rejects a revised sanction schema rather than guessing adjusted points',()=>{const b=fixture();b.pages[0].wikitext=b.pages[0].wikitext.replace('|section=', '|adjust_points_AA=-3\n|section=');expect(()=>normalizeWikimediaSports(b,now)).toThrow('UNREVIEWED_FORMAT');});
 it('rejects inconsistent goals',()=>{const b=fixture();b.pages[0].wikitext=b.pages[0].wikitext.replace('|gf_AA=5','|gf_AA=6');expect(()=>normalizeWikimediaSports(b,now)).toThrow('INCONSISTENT_TABLE');});
});
