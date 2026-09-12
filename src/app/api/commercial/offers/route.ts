import {offersRequest} from '@/affiliate/server';
export async function POST(request:Request){return offersRequest(request);}
