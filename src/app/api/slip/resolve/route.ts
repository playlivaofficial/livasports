import {resolveSlipRequest} from '@/slip/server';
export const runtime='nodejs';
export async function POST(request:Request){return resolveSlipRequest(request);}
