import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {generateKeyPairSync} from 'node:crypto';
import {GSC_MAX_ROWS,GscApiError,listSitemaps,refreshTokenAccess,searchAnalytics,serviceAccountToken} from './gsc-client';
import {gscCredential,gscProperty,gscStatus} from './gsc';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const rows=(n:number,offset=0)=>Array.from({length:n},(_,i)=>({keys:[`2026-09-${String((i+offset)%28+1).padStart(2,'0')}`],
  clicks:1,impressions:10,ctr:0.1,position:12}));

describe('credential resolution',()=>{
  it('reports NOT_CONNECTED with the exact missing access and never accepts the NextAuth client',()=>{
    const status=gscStatus({} as never);
    expect(status.state).toBe('NOT_CONNECTED');
    expect(status.missing).toMatch(/GSC_SERVICE_ACCOUNT_JSON|GSC_REFRESH_TOKEN/);
    expect(gscCredential({AUTH_GOOGLE_ID:'x',AUTH_GOOGLE_SECRET:'y'} as never)).toBeNull();
  });
  it('parses a service account and an OAuth triple, and fails safely on malformed JSON',()=>{
    expect(gscCredential({GSC_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'a@b.iam',private_key:'k'})}))
      .toEqual({kind:'SERVICE_ACCOUNT',clientEmail:'a@b.iam',privateKey:'k'});
    expect(gscCredential({GSC_REFRESH_TOKEN:'r',GSC_CLIENT_ID:'c',GSC_CLIENT_SECRET:'s'}))
      .toEqual({kind:'OAUTH',clientId:'c',clientSecret:'s',refreshToken:'r'});
    expect(gscCredential({GSC_SERVICE_ACCOUNT_JSON:'{not json'})).toBeNull();
    expect(gscStatus({GSC_SERVICE_ACCOUNT_JSON:'{not json'}).state).toBe('MISCONFIGURED');
    expect(gscStatus({GSC_REFRESH_TOKEN:'r'}).state).toBe('MISCONFIGURED');
  });
  it('defaults to the domain property and honours a URL-prefix override',()=>{
    expect(gscProperty({})).toBe('sc-domain:livasports.com');
    expect(gscProperty({GSC_PROPERTY:'https://livasports.com/'})).toBe('https://livasports.com/');
  });
});

describe('access tokens',()=>{
  it('signs a service-account assertion and asks only for the read-only scope',async()=>{
    let sent='';
    const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{sent=String(init?.body);return json({access_token:'tok'});}) as unknown as typeof fetch;
    expect(await serviceAccountToken({clientEmail:'a@b.iam',privateKey},fetcher)).toBe('tok');
    const assertion=new URLSearchParams(sent).get('assertion')!;
    const claims=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url').toString());
    expect(claims.scope).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    expect(claims.scope).not.toMatch(/webmasters$/);
    expect(claims.iss).toBe('a@b.iam');
  });
  it('turns a rejected credential into AUTH_ERROR without echoing the response',async()=>{
    const fetcher=vi.fn(async()=>json({error:'invalid_grant',secret_echo:'should-not-surface'},400)) as unknown as typeof fetch;
    await expect(serviceAccountToken({clientEmail:'a@b.iam',privateKey},fetcher)).rejects.toMatchObject({code:'AUTH_ERROR'});
    await expect(refreshTokenAccess({clientId:'c',clientSecret:'s',refreshToken:'r'},fetcher)).rejects.toMatchObject({code:'AUTH_ERROR'});
    await expect(serviceAccountToken({clientEmail:'a@b.iam',privateKey},fetcher)).rejects.not.toThrow(/should-not-surface/);
  });
  it('rejects an unusable private key as AUTH_ERROR rather than crashing',async()=>{
    const fetcher=vi.fn(async()=>json({access_token:'tok'})) as unknown as typeof fetch;
    await expect(serviceAccountToken({clientEmail:'a@b.iam',privateKey:'not-a-key'},fetcher)).rejects.toMatchObject({code:'AUTH_ERROR'});
  });
});

describe('search analytics reads',()=>{
  it('requests final data only, so partial days never enter a comparison',async()=>{
    let body:Record<string,unknown>={};
    const fetcher=vi.fn(async(_u:string,init?:RequestInit)=>{body=JSON.parse(String(init?.body));return json({rows:[]});}) as unknown as typeof fetch;
    await searchAnalytics('tok','sc-domain:livasports.com',{startDate:'2026-09-01',endDate:'2026-09-07',dimensions:['date']},{fetcher});
    expect(body.dataState).toBe('final');
    expect(body.rowLimit).toBe(GSC_MAX_ROWS);
  });
  it('pages until a short page arrives and returns every row',async()=>{
    const pages=[rows(GSC_MAX_ROWS),rows(10)];
    let call=0;
    const fetcher=vi.fn(async()=>json({rows:pages[call++]??[]})) as unknown as typeof fetch;
    const result=await searchAnalytics('tok','p',{startDate:'a',endDate:'b',dimensions:['date']},{fetcher,maxRows:100_000});
    expect(result.rows).toHaveLength(GSC_MAX_ROWS+10);
    expect(result.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reports truncation instead of silently dropping rows at the ceiling',async()=>{
    const fetcher=vi.fn(async()=>json({rows:rows(GSC_MAX_ROWS)})) as unknown as typeof fetch;
    const result=await searchAnalytics('tok','p',{startDate:'a',endDate:'b',dimensions:['date']},{fetcher,maxRows:GSC_MAX_ROWS});
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(GSC_MAX_ROWS);
  });
  it('maps 401 to AUTH_ERROR, 403/404 to PROPERTY_DENIED and the rest to API_ERROR',async()=>{
    const codes:Array<[number,string]>=[[401,'AUTH_ERROR'],[403,'PROPERTY_DENIED'],[404,'PROPERTY_DENIED'],[429,'API_ERROR'],[500,'API_ERROR']];
    for(const [status,code] of codes){
      const fetcher=vi.fn(async()=>json({error:'x'},status)) as unknown as typeof fetch;
      await expect(searchAnalytics('tok','p',{startDate:'a',endDate:'b',dimensions:['date']},{fetcher}))
        .rejects.toMatchObject({code});
    }
  });
});

describe('sitemap metadata',()=>{
  it('sums submitted counts and keeps indexed null when Google does not report it',async()=>{
    const fetcher=vi.fn(async()=>json({sitemap:[
      {path:'https://livasports.com/sitemap.xml',warnings:0,errors:0,contents:[{submitted:'510'}]},
      {path:'https://livasports.com/sports-sitemaps.xml',warnings:1,errors:0,contents:[{submitted:'14000',indexed:'900'}]}]})) as unknown as typeof fetch;
    const list=await listSitemaps('tok','p',fetcher);
    expect(list[0]).toMatchObject({submitted:510,indexed:null,errors:0});
    expect(list[1]).toMatchObject({submitted:14000,indexed:900,warnings:1});
  });
  it('surfaces a denied property rather than an empty list',async()=>{
    const fetcher=vi.fn(async()=>json({},403)) as unknown as typeof fetch;
    await expect(listSitemaps('tok','p',fetcher)).rejects.toBeInstanceOf(GscApiError);
  });
});
