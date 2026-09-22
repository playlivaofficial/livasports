import {growthSchedulerResponse} from '@/growth/scheduler-server';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request){return growthSchedulerResponse(request);}
export async function POST(request:Request){return growthSchedulerResponse(request);}
