import {describe,it,expect} from 'vitest';
import {correctionSchema,applyCorrections,CorrectionContractError} from './review';
import type {GeneratedCopy} from './policy';
const part={title:'Synthetic award title',summary:'Synthetic announcement summary for offline testing.',body:'Synthetic source reports a verified award announcement.'};
const copy:GeneratedCopy={en:{...part},es:{...part},pt:{...part}};
describe('target-bound correction contract',()=>{
 it('requires exactly the requested keys and cannot request a different field',()=>{const s=correctionSchema(['en.body','pt.body']);expect(s.properties.changes.required).toEqual(['en.body','pt.body']);expect(Object.keys(s.properties.changes.properties)).toEqual(['en.body','pt.body']);expect(s.properties.changes.additionalProperties).toBe(false);});
 it.each([
  [{changes:[]},'SHAPE'],[{changes:{}},'MISSING_TARGET'],[{changes:{'en.title':'outside'}},'EXTRA_TARGET'],[{changes:{'en.body':42}},'TEXT_TYPE'],[{changes:{'en.body':''}},'TEXT_LENGTH'],[{changes:{'en.body':'x'.repeat(1801)}},'TEXT_LENGTH']
 ])('retains a text-free specific diagnostic for %j', (patch,code)=>{try{applyCorrections(copy,patch,['en.body']);throw Error('Expected failure');}catch(e){expect(e).toBeInstanceOf(CorrectionContractError);expect((e as CorrectionContractError).diagnostic.code).toBe(code);expect((e as Error).message).toBe('MODEL_CORRECTION_INVALID');}});
 it('preserves all untargeted fields and never mutates input',()=>{const changed=applyCorrections(copy,{changes:{'en.body':'Replacement within the permitted field.'}},['en.body']);expect(changed.es).toEqual(copy.es);expect(changed.en.title).toBe(copy.en.title);expect(copy.en.body).toBe(part.body);});
 it('rejects duplicate/invalid target specifications before a model call',()=>{expect(()=>correctionSchema(['en.body','en.body'])).toThrow();expect(()=>correctionSchema(['private-key'])).toThrow();});
 it('does not include attacker-controlled field names in diagnostics',()=>{try{applyCorrections(copy,{changes:{'Bearer private-value':'x'}},['en.body']);}catch(e){expect(JSON.stringify((e as CorrectionContractError).diagnostic)).not.toContain('private-value');}});
});
