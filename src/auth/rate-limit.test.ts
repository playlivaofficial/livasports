import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';

type Rate={bucket_hash:string;window_started_at:Date;attempt_count:number;blocked_until:Date|null};
const {store}=vi.hoisted(()=>{
  const rates:Rate[]=[];
  return {store:{
    rates,
    async query(sql:string,params:unknown[]=[]){
      if(sql.includes('SELECT blocked_until')){
        const row=rates.find(item=>item.bucket_hash===params[0]&&item.blocked_until&&item.blocked_until>new Date());
        return {rows:row?[{blocked_until:row.blocked_until}]:[]};
      }
      const bucket=params[0] as string,window=params[1] as number,maximum=params[2] as number,now=new Date();
      let row=rates.find(item=>item.bucket_hash===bucket);
      if(!row||row.window_started_at.getTime()<=now.getTime()-window*1000){
        row={bucket_hash:bucket,window_started_at:now,attempt_count:1,blocked_until:null};
        const index=rates.findIndex(item=>item.bucket_hash===bucket);
        if(index>=0)rates.splice(index,1);
        rates.push(row);
      }else row.attempt_count+=1;
      if(row.attempt_count>=maximum)row.blocked_until=new Date(now.getTime()+window*1000);
      return {rows:[{blocked_until:row.blocked_until}]};
    },
  }};
});

vi.mock('server-only',()=>({}));
vi.mock('./database',()=>({authDatabase:()=>store}));

describe('user email login rate limiting',()=>{
  afterEach(()=>{store.rates.length=0;vi.unstubAllEnvs();});

  it('uses AUTH_SECRET and a dedicated table, separate from owner QA throttling',async()=>{
    vi.stubEnv('AUTH_SECRET','u'.repeat(32));
    const {emailLoginAllowed,emailLoginBucket}=await import('./rate-limit');
    const source=readFileSync('src/auth/rate-limit.ts','utf8');
    expect(source).toContain('auth_email_login_rate_limits');
    expect(source).not.toContain('owner_qa_login_rate_limits');
    expect(source).not.toContain('OWNER_QA_SESSION_SECRET');
    const request=new Request('https://livasports.com/en/sign-in',{headers:{'x-forwarded-for':'203.0.113.9'}});
    expect(emailLoginBucket(request,'user@example.com')).not.toBe(emailLoginBucket(request,'other@example.com'));
    for(let i=0;i<4;i+=1)expect((await emailLoginAllowed(request,'user@example.com')).allowed).toBe(true);
    expect((await emailLoginAllowed(request,'user@example.com')).allowed).toBe(false);
    expect((await emailLoginAllowed(request,'other@example.com')).allowed).toBe(true);
  });

  it('limits a recipient even when request sources change',async()=>{
    vi.stubEnv('AUTH_SECRET','u'.repeat(32));
    const {emailLoginAllowed}=await import('./rate-limit');
    const attempt=(i:number)=>emailLoginAllowed(new Request('https://livasports.com/api/auth/signin/nodemailer',{headers:{'x-forwarded-for':`203.0.113.${i}`}}),'same@example.com');
    for(let i=1;i<=4;i++)expect((await attempt(i)).allowed).toBe(true);
    expect((await attempt(5)).allowed).toBe(false);
    expect(store.rates.every(row=>/^[a-f0-9]{64}$/.test(row.bucket_hash))).toBe(true);
  });

  it('limits a source even when recipients change',async()=>{
    vi.stubEnv('AUTH_SECRET','u'.repeat(32));
    const {emailLoginAllowed}=await import('./rate-limit');
    const request=new Request('https://livasports.com/api/auth/signin/nodemailer',{headers:{'x-forwarded-for':'203.0.113.9'}});
    for(let i=0;i<19;i++)expect((await emailLoginAllowed(request,`recipient${i}@example.com`)).allowed).toBe(true);
    expect((await emailLoginAllowed(request,'last@example.com')).allowed).toBe(false);
  });
});
