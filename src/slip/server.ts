import 'server-only';
import {databaseUrl,PostgresDatabaseClient} from '@/database/client';
import {readPublicOddsFixtures} from '@/odds/read-repository';
import {SlipLoader} from './loader';
import {parseResolutionRequest} from './types';
import {requestCommercialGeo} from '@/odds/commercial-geo';

const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
let db:PostgresDatabaseClient|null=null;
const loader=new SlipLoader(async(ids,geo)=>{
  const url=databaseUrl();if(!url)throw new Error('SLIP_DATABASE_UNAVAILABLE');
  db??=new PostgresDatabaseClient(url);return readPublicOddsFixtures(db,ids,geo);
});
export async function boundedJson(request:Request,limit=4096):Promise<unknown>{
  const reader=request.body?.getReader();if(!reader)return null;
  const decoder=new TextDecoder();let size=0;let text='';
  try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
      if(size>limit){await reader.cancel();throw new Error('BODY_TOO_LARGE');}text+=decoder.decode(chunk.value,{stream:true});}
    return JSON.parse(text+decoder.decode());
  }finally{reader.releaseLock();}
}
export async function resolveSlipRequest(request:Request,service:Pick<SlipLoader,'resolve'>=loader):Promise<Response>{
  const response=(body:unknown,status=200)=>Response.json(body,{status,headers});
  const url=new URL(request.url);const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return response({error:'INVALID_ORIGIN',providerRequests:0},403);
  if(url.search||!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'INVALID_REQUEST',providerRequests:0},400);
  let input;
  try{input=parseResolutionRequest(await boundedJson(request));}catch(error){return response({error:'INVALID_BODY',providerRequests:0},error instanceof Error&&error.message==='BODY_TOO_LARGE'?413:400);}
  if(!input)return response({error:'INVALID_SLIP',providerRequests:0},400);
  try{const result=await service.resolve(input.selections,input.locale,requestCommercialGeo(request.headers));
    console.info(`[LivaSports M6] ${JSON.stringify({event:'slip-resolve',count:input.selections.length,locale:input.locale,providerRequests:0})}`);
    return response(result);
  }catch{return response({error:'SLIP_TEMPORARILY_UNAVAILABLE',providerRequests:0},503);}
}
