import {v2RuntimePolicy} from '@/v2/retired';
export const dynamic='force-dynamic';
export async function GET(){const commit=process.env.VERCEL_GIT_COMMIT_SHA??process.env.LIVASPORTS_RELEASE_SHA;return Response.json({status:'ok',...v2RuntimePolicy,release:{commit:commit&&/^[a-f0-9]{40}$/.test(commit)?commit:null}},{headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});}
