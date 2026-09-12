import {commercialHeaders} from '@/affiliate/server';
// No credentials, operator documentation, sub-ID convention, or signature
// scheme was supplied. Never parse or persist unsolicited conversion claims.
export async function POST(){return new Response(null,{status:404,headers:commercialHeaders});}
export async function GET(){return new Response(null,{status:404,headers:commercialHeaders});}
