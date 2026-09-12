import {outboundRequest,commercialHeaders} from '@/affiliate/server';
export async function GET(request:Request,{params}:{params:Promise<{bookmaker:string;placement:string}>}){const p=await params;return outboundRequest(request,p.bookmaker,p.placement);}
export async function HEAD(){return new Response(null,{status:204,headers:commercialHeaders});}
