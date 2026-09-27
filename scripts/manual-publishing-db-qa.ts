/** Read-only by default; --rollback exercises real SQL in one transaction that is ALWAYS rolled back.
 * No renderer, synthesis or provider call. Never commits a test publication or changes an existing asset. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {databaseUrl,PostgresDatabaseClient,type DatabaseClient} from '../src/database/client';
import {readGrowthItem} from '../src/growth/repository';
import {markGrowthPosted,readPublishingOverview,isLatestGrowthItem} from '../src/growth/manual-repository';
import {postSnapshot,publishingState} from '../src/growth/manual-publishing';
import {CREATIVE_VERSION} from '../src/growth/creative-version';

const db=new PostgresDatabaseClient(databaseUrl()!,()=>undefined,{statementTimeoutMs:10000});
try{
  if(process.argv.includes('--rollback')){
    try{await db.transaction(async tx=>{
      await tx.query("SET LOCAL lock_timeout='2s'");
      const migration=await readFile(new URL('../db/migrations/046_growth_manual_publishing.sql',import.meta.url),'utf8');
      // Migration runner owns BEGIN/COMMIT in ordinary releases; this QA wrapper owns the rollback.
      await tx.query(migration.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
      const scoped={query:tx.query.bind(tx),transaction:async work=>work(tx),close:async()=>undefined} as DatabaseClient;
      const row=(await tx.query<{id:string}>(`SELECT i.id FROM growth_content_items i WHERE i.creative_version=$1 AND i.superseded_at IS NULL
        AND EXISTS(SELECT 1 FROM growth_platform_assets a WHERE a.content_item_id=i.id AND a.channel='TIKTOK' AND a.status='READY')
        ORDER BY i.created_at DESC,i.id DESC LIMIT 1`,[CREATIVE_VERSION])).rows[0];
      assert(row);const item=await readGrowthItem(tx,row.id);assert(item);const asset=item.platformAssets!.find(a=>a.channel==='TIKTOK')!;
      const input={itemId:item.id,channel:'TIKTOK' as const,sha256:asset.sha256!,creativeVersion:CREATIVE_VERSION,notes:'ROLLBACK QA — not an external post'};
      const receipt=await markGrowthPosted(scoped,input,'rollback-qa');
      const reread=await readGrowthItem(tx,item.id);assert.equal(reread!.channels.find(c=>c.channel==='TIKTOK')!.status,'PUBLISHED');
      await assert.rejects(()=>markGrowthPosted(scoped,input,'rollback-qa'),/ALREADY_POSTED/);
      const history=await readPublishingOverview(tx);const saved=history.posts.find(p=>p.id===receipt.id);assert(saved);
      assert.deepEqual(saved.snapshot,postSnapshot(item,'TIKTOK'));assert.equal(saved.assetSha256,asset.sha256);
      assert.equal(saved.creativeVersion,CREATIVE_VERSION);
      // Simulate a new generated creative record with the same existing media bytes, without rendering.
      // Everything below is rollback-only. Original posted item/media are never updated.
      const next=(await tx.query<{id:string}>(`INSERT INTO growth_content_items(fixture_id,revision,generator_version,source_hash,trigger_source,priority_score,
        score_breakdown,ranking_reasons,fixture_snapshot,content_pack,canonical_url,creative_version,content_identity,created_at,supersedes_item_id)
        SELECT fixture_id,(SELECT max(revision)+1 FROM growth_content_items WHERE fixture_id=i.fixture_id),generator_version,source_hash,'OWNER',priority_score,
          score_breakdown,ranking_reasons,fixture_snapshot,content_pack,canonical_url,creative_version,content_identity||'-qa-new-facts',now()+interval '1 second',id
        FROM growth_content_items i WHERE id=$1 RETURNING id`,[item.id])).rows[0];
      await tx.query(`INSERT INTO growth_content_channels(content_item_id,channel,status,tracked_url) SELECT $2,channel,'DRAFT',tracked_url FROM growth_content_channels WHERE content_item_id=$1`,[item.id,next.id]);
      await tx.query(`INSERT INTO growth_platform_assets(content_item_id,channel,status,mime_type,sha256,byte_length,video_data,error_code,generated_at,render_metadata,creative_version)
        SELECT $2,channel,status,mime_type,sha256,byte_length,video_data,error_code,generated_at,render_metadata,creative_version FROM growth_platform_assets WHERE content_item_id=$1`,[item.id,next.id]);
      const newItem=await readGrowthItem(tx,next.id);assert(newItem);assert.equal(publishingState(newItem,'TIKTOK'),'READY_TO_POST');
      assert.equal(await isLatestGrowthItem(tx,item.id),false);assert.equal(await isLatestGrowthItem(tx,next.id),true);
      assert.equal((await readPublishingOverview(tx)).posts.find(p=>p.id===receipt.id)!.superseded,true);
      console.log(JSON.stringify({rollbackQa:'PASS',receiptExact:true,reload:true,duplicateBlocked:true,newRevisionReady:true,oldPostedPreserved:true,staleDownloadBlocked:true,renderCalls:0,voiceCalls:0}));
      throw new Error('EXPECTED_QA_ROLLBACK');
    });}catch(error){if(!(error instanceof Error)||error.message!=='EXPECTED_QA_ROLLBACK')throw error;}
  }else{
    const history=await readPublishingOverview(db);console.log(JSON.stringify({posts:history.posts.map(p=>({id:p.id,itemId:p.itemId,channel:p.channel,version:p.creativeVersion,sha256:p.assetSha256,postedAt:p.postedAt,metrics:p.metrics})),total:history.total,today:history.today,last7Days:history.last7Days,byPlatform:history.byPlatform}));
  }
}catch(error){console.error(JSON.stringify({error:error instanceof Error?error.message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted]'):'QA_FAILED',code:(error as {code?:string}).code}));process.exitCode=1;}
finally{await db.close();}
