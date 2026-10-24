import {describe,it,expect,vi} from 'vitest';
import {AutomationRepository,type AutomationEvent} from './repository';
import type {DatabaseClient} from '@/database/client';
import {previewNews} from '../seed';
import type {NewsDraft} from '../model';
const now=new Date('2026-10-24T12:00:00.000Z');
function draft():NewsDraft{
 const {publishedAt,updatedAt,verifiedAt,...value}=previewNews[0];
 void publishedAt;void updatedAt;void verifiedAt;
 return {...value,originalLanguage:'en',translationReview:{en:{state:'validated',reviewedAt:now.toISOString()},es:{state:'validated',reviewedAt:now.toISOString()},pt:{state:'validated',reviewedAt:now.toISOString()}}};
}
function repository(){const transaction=vi.fn().mockRejectedValue(new Error('TEST_TRANSACTION_REACHED'));return {transaction,repo:new AutomationRepository({transaction} as unknown as DatabaseClient)};}
describe('publication presentation contract — synthetic, no model calls',()=>{
 it('rejects a three-millisecond clock mismatch before any database mutation',async()=>{
  const {repo,transaction}=repository();await expect(repo.publish('synthetic-run',{} as AutomationEvent,draft(),new Date(now.getTime()+3))).rejects.toThrow('PUBLICATION_PRESENTATION_INVALID');expect(transaction).not.toHaveBeenCalled();
 });
 it('retains the matching-clock contract used by the scheduler',async()=>{
  const {repo,transaction}=repository();await expect(repo.publish('synthetic-run',{} as AutomationEvent,draft(),now)).rejects.toThrow('TEST_TRANSACTION_REACHED');expect(transaction).toHaveBeenCalledOnce();
 });
 it('rejects a pending translation without silently restamping approval',async()=>{
  const {repo,transaction}=repository(),value=draft();value.translationReview!.pt={state:'pending',reviewedAt:null};await expect(repo.publish('synthetic-run',{} as AutomationEvent,value,now)).rejects.toThrow('PUBLICATION_PRESENTATION_INVALID');expect(transaction).not.toHaveBeenCalled();
 });
});
