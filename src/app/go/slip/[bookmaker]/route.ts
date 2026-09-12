import {legacySlipRequest,commercialHeaders} from '@/affiliate/server';
export async function GET(request:Request,{params}:{params:Promise<{bookmaker:string}>}){
  return legacySlipRequest(request,(await params).bookmaker);
}
export async function HEAD(){return new Response(null,{status:204,headers:commercialHeaders});}
