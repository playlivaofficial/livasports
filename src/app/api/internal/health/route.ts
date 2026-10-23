import {v2RuntimePolicy} from '@/v2/retired';
import {connection} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(){
  await connection();
  // CLI deployments may provide an empty platform SHA. Accept only a validated
  // revision; an empty/invalid platform value must not hide the release fallback.
  const commit=[process.env.VERCEL_GIT_COMMIT_SHA,process.env.LIVASPORTS_RELEASE_SHA]
    .find(value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value))??null;
  return Response.json({status:'ok',...v2RuntimePolicy,release:{commit}},{headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
}
