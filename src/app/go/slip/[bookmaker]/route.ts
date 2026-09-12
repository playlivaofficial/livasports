import {slipOutboundRequest} from '@/slip/comparison-server';
export async function GET(request:Request,{params}:{params:Promise<{bookmaker:string}>}){
  return slipOutboundRequest(request,(await params).bookmaker);
}
