import {requestOwnerSession} from '@/owner/session';
import {withAutomation} from '@/editorial/automation/server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Vary':'Cookie','Referrer-Policy':'no-referrer'};
export async function GET(request:Request){
 if(!requestOwnerSession(request.headers))return Response.json({error:'UNAUTHORIZED'},{status:401,headers});
 if(new URL(request.url).search)return Response.json({error:'INVALID_REQUEST'},{status:400,headers});
 try{return Response.json({retentionDays:7,evidence:await withAutomation(repo=>repo.reviewEvidence())},{headers});}
 catch{return Response.json({error:'PRIVATE_EVIDENCE_UNAVAILABLE'},{status:503,headers});}
}
