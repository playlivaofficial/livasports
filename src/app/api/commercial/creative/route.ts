import {creativeRequest} from '@/affiliate/server';
export function GET(request:Request){return creativeRequest(request);}
export function HEAD(request:Request){return creativeRequest(request);}
