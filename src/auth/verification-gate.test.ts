import {beforeEach,describe,expect,it,vi} from 'vitest';
import {normalizeEmail} from './identity';
const {limit}=vi.hoisted(()=>({limit:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next-auth',()=>({default:vi.fn()}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({'x-vercel-forwarded-for':'203.0.113.9'})}));
vi.mock('./database',()=>({authConfigured:()=>false,authDatabase:()=>({}),emailAuthConfigured:()=>true,googleAuthConfigured:()=>true}));
vi.mock('./rate-limit',()=>({emailLoginAllowed:limit}));

describe('shared Auth.js email verification gate',()=>{
  beforeEach(()=>{vi.stubEnv('AUTH_SECRET','u'.repeat(32));limit.mockReset();});
  const args={account:{provider:'nodemailer',type:'email',providerAccountId:'qa@example.com'},user:{id:'test',email:' QA@example.com '},email:{verificationRequest:true}};
  it('covers direct provider requests before SMTP/token creation',async()=>{
    const {buildAuthConfig}=await import('./config');
    limit.mockResolvedValue({allowed:false,retryAfter:900});
    const signIn=buildAuthConfig().callbacks!.signIn!;
    expect(await signIn(args as never)).toBe(false);
    expect(limit).toHaveBeenCalledWith(expect.any(Request),'qa@example.com');
    limit.mockResolvedValue({allowed:true,retryAfter:null});
    expect(await signIn(args as never)).toBe(true);
  });
  it('fails closed on limiter outage without blocking consumption of an existing valid link',async()=>{
    const {buildAuthConfig}=await import('./config');
    limit.mockRejectedValue(new Error('DB_UNAVAILABLE'));
    const signIn=buildAuthConfig().callbacks!.signIn!;
    expect(await signIn(args as never)).toBe(false);
    limit.mockClear();
    expect(await signIn({...args,email:undefined} as never)).toBe(true);
    expect(limit).not.toHaveBeenCalled();
  });
  it('rejects mailbox lists and normalizes unicode before validation',()=>{
    for(const email of ['a,b@example.com','a;evil@example.com','"a"@example.com','a<b@example.com','a\\b@example.com'])expect(normalizeEmail(email)).toBeNull();
    expect(normalizeEmail(' QA＠example.com ')).toBe('qa@example.com');
    expect(normalizeEmail('qa＠example.com@evil.test')).toBeNull();
  });
});
