import {describe,expect,it,vi} from 'vitest';
import {createAuthAdapter} from './adapter';
import {googleSignInAllowed,normalizeEmail} from './identity';
import {MemoryAuthDatabase} from './memory';
import {AuthRepository,hashToken} from './repository';

vi.mock('server-only',()=>({}));

function repo(){
  const database=new MemoryAuthDatabase();
  return {database,repo:new AuthRepository(database),adapter:createAuthAdapter(database as never)};
}

describe('auth repository and adapter contract',()=>{
  it('normalizes email uniqueness and never silently merges a second account',async()=>{
    expect(normalizeEmail('  A.B@Example.COM ')).toBe('a.b@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    const {repo:auth}=repo();
    const user=await auth.createUser({email:'  A.B@Example.COM ',name:'Ana'});
    expect(user.email).toBe('a.b@example.com');
    await expect(auth.createUser({email:'a.b@example.com'})).rejects.toThrow('EMAIL_IN_USE');
    const first=await auth.createUser({email:'other@example.com'});
    await expect(auth.createUser({email:'OTHER@example.com'})).rejects.toThrow('EMAIL_IN_USE');
    expect((await auth.getUserByEmail(' other@example.com '))?.id).toBe(first.id);
  });

  it('keeps Google identity on provider+providerAccountId and requires a verified email',async()=>{
    const {repo:auth}=repo();
    const user=await auth.createUser({email:'google@example.com',emailVerified:new Date()});
    await auth.linkAccount({userId:user.id,type:'oidc',provider:'google',providerAccountId:'gid-1'});
    expect((await auth.getUserByAccount('google','gid-1'))?.id).toBe(user.id);
    await expect(auth.linkAccount({userId:user.id,type:'oidc',provider:'google',providerAccountId:'gid-1'})).rejects.toThrow(/unique/);
    expect(googleSignInAllowed({email:'google@example.com',email_verified:true})).toBe(true);
    expect(googleSignInAllowed({email:'google@example.com',email_verified:false})).toBe(false);
    expect(googleSignInAllowed({email:'google@example.com'})).toBe(false);
  });

  it('hashes magic-link tokens, consumes them once, and rejects expiry and replay',async()=>{
    const {database,repo:auth}=repo();
    const token='plain-magic-token';
    const created=await auth.createVerificationToken({identifier:'  User@Email.COM ',token,expires:new Date(Date.now()+60_000)});
    expect(created.identifier).toBe('user@email.com');
    expect(database.tokens[0]?.token_hash).toBe(hashToken(token));
    expect(database.tokens[0]?.token_hash).not.toBe(token);
    expect(JSON.stringify(database.statements)).not.toContain(token);
    expect(await auth.useVerificationToken({identifier:'user@email.com',token})).toEqual(created);
    expect(await auth.useVerificationToken({identifier:'user@email.com',token})).toBeNull();
    await auth.createVerificationToken({identifier:'user@email.com',token:'expired',expires:new Date(Date.now()-1000)});
    expect(await auth.useVerificationToken({identifier:'user@email.com',token:'expired'})).toBeNull();
  });

  it('creates, retrieves, expires and revokes hashed database sessions',async()=>{
    const {database,repo:auth}=repo();
    const user=await auth.createUser({email:'session@example.com'});
    const sessionToken='opaque-session-token';
    await auth.createSession({sessionToken,userId:user.id,expires:new Date(Date.now()+60_000)});
    expect(database.sessions[0]?.session_token_hash).toBe(hashToken(sessionToken));
    expect(database.sessions[0]?.session_token_hash).not.toBe(sessionToken);
    const live=await auth.getSessionAndUser(sessionToken);
    expect(live?.user.id).toBe(user.id);
    expect(live?.session.sessionToken).toBe(sessionToken);
    await auth.deleteSession(sessionToken);
    expect(await auth.getSessionAndUser(sessionToken)).toBeNull();
    await auth.createSession({sessionToken:'expired-session',userId:user.id,expires:new Date(Date.now()-1000)});
    expect(await auth.getSessionAndUser('expired-session')).toBeNull();
    expect(database.sessions.find(row=>row.session_token_hash===hashToken('expired-session'))).toBeUndefined();
  });

  it('satisfies the Auth.js adapter CRUD mapping without storing plaintext tokens',async()=>{
    const {adapter,database}=repo();
    const user=await adapter.createUser!({id:'',email:'adapter@example.com',emailVerified:null,name:'Ada',image:null});
    expect((await adapter.getUserByEmail!('ADAPTER@example.com'))?.id).toBe(user.id);
    await adapter.linkAccount!({userId:user.id,type:'email',provider:'nodemailer',providerAccountId:'adapter@example.com'} as never);
    expect((await adapter.getUserByAccount!({provider:'nodemailer',providerAccountId:'adapter@example.com'}))?.id).toBe(user.id);
    const session=await adapter.createSession!({sessionToken:'adapter-session',userId:user.id,expires:new Date(Date.now()+1000)});
    expect((await adapter.getSessionAndUser!('adapter-session'))?.user.id).toBe(user.id);
    await adapter.deleteSession!('adapter-session');
    expect(await adapter.getSessionAndUser!('adapter-session')).toBeNull();
    expect(session.sessionToken).toBe('adapter-session');
    expect(database.sessions).toHaveLength(0);
  });
});
