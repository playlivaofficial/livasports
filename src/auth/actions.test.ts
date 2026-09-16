import {beforeEach,describe,expect,it,vi} from 'vitest';

const signIn=vi.fn();
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({'x-forwarded-for':'203.0.113.9'})}));
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw Object.assign(new Error('REDIRECT'),{digest:`NEXT_REDIRECT;${path}`});}}));
vi.mock('./config',()=>({signIn,signOut:vi.fn(),auth:vi.fn(async()=>null)}));
vi.mock('./rate-limit',()=>({emailLoginAllowed:vi.fn(async()=>({allowed:true,retryAfter:null}))}));
vi.mock('./database',()=>({
  authConfigured:()=>true,
  emailAuthConfigured:()=>true,
  googleAuthConfigured:()=>true,
  authDatabase:()=>({}),
}));

describe('magic-link request anti-enumeration',()=>{
  beforeEach(()=>{signIn.mockReset();});

  it('returns the same generic success for unknown, invalid and failing emails',async()=>{
    const {requestMagicLink}=await import('./actions');
    signIn.mockRejectedValue(new Error('SMTP_DOWN'));
    const unknown=new FormData();unknown.set('locale','en');unknown.set('email','new-user@example.com');
    const invalid=new FormData();invalid.set('locale','br');invalid.set('email','not-an-email');
    expect(await requestMagicLink(unknown)).toEqual({ok:true});
    expect(await requestMagicLink(invalid)).toEqual({ok:true});
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
