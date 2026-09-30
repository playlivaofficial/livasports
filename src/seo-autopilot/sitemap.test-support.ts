import {vi} from 'vitest';
import type {QueryExecutor} from '@/database/client';
import {GSC_WRITE_SCOPE} from '@/seo/gsc-health';
import {maintainSeoSitemaps} from './sitemaps';
export const sitemapNow=new Date('2026-09-30T12:00:00Z');
export const xml=(day='2026-09-29')=>`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://livasports.com/br</loc><lastmod>${day}</lastmod></url></urlset>`;
export const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
export function sitemapHarness(scope=GSC_WRITE_SCOPE,permission='siteOwner'){
  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON','');vi.stubEnv('GSC_CLIENT_ID','private-client');vi.stubEnv('GSC_CLIENT_SECRET','private-secret');vi.stubEnv('GSC_REFRESH_TOKEN','private-refresh');vi.stubEnv('GSC_PROPERTY','sc-domain:livasports.com');
  const stored=new Map<string,Record<string,unknown>>();let day='2026-09-29';
  const query=vi.fn(async(sql:string,args:unknown[]=[])=>{
    const path=String(args[0]);let row=stored.get(path);
    if(sql.startsWith('SELECT'))return {rows:[...stored.values()]};
    if(sql.startsWith('INSERT')){if(!row){row={path,content_hash:'',audit:[],failure_count:0};stored.set(path,row);}return {rows:[]};}
    if(sql.includes('RETURNING *')){
      if(row!.lease_until&&new Date(String(row!.lease_until))>new Date(String(args[3])))return {rows:[]};
      row!.lease_token=args[1];row!.lease_until=args[2];return {rows:[{...row}]};
    }
    if(!row||row.lease_token!==args[1])return {rows:[]};
    if(sql.includes('lease_token=NULL')){row.lease_token=null;row.lease_until=null;return {rows:[]};}
    for(const match of sql.slice(0,sql.indexOf(' WHERE')).matchAll(/(\w+)=\$(\d+)/g)){
      const value=args[Number(match[2])-1];row[match[1]]=['audit','diagnostic'].includes(match[1])&&typeof value==='string'?JSON.parse(value):value;
    }
    return {rows:sql.includes('RETURNING path')?[{path}]:[]};
  });
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);if(url.includes('oauth2.googleapis.com'))return json({access_token:'private-access',scope});
    if(init?.method==='PUT')return new Response(null,{status:204});
    if(url.startsWith('https://livasports.com/'))return new Response(xml(day),{headers:{'content-type':'application/xml'}});
    if(url.endsWith('/query'))return json({rows:[]});if(url.endsWith('/sitemaps'))return json({sitemap:[]});
    return json({siteUrl:'sc-domain:livasports.com',permissionLevel:permission});
  });
  const db={query} as unknown as QueryExecutor,log=vi.fn(),sleep=vi.fn(async()=>undefined);
  const run=(date=sitemapNow,f:typeof fetch=fetcher)=>maintainSeoSitemaps(db,date,f,undefined,{log,sleep});
  return {db,query,fetcher,stored,log,sleep,run,change:()=>{day='2026-09-30';},puts:()=>fetcher.mock.calls.filter(c=>c[1]?.method==='PUT')};
}
