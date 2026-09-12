import {compareSlipRequest} from '@/slip/comparison-server';
export async function POST(request:Request){return compareSlipRequest(request);}
