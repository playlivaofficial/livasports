import type {Adapter,AdapterAccount,AdapterUser,AdapterSession,VerificationToken} from 'next-auth/adapters';
import type {DatabaseClient} from '@/database/client';
import {AuthRepository} from './repository';

function toAdapterUser(user:{id:string;email:string;emailVerified:Date|null;name:string|null;image:string|null}):AdapterUser {
  return {id:user.id,email:user.email,emailVerified:user.emailVerified,name:user.name,image:user.image};
}

export function createAuthAdapter(database:DatabaseClient):Adapter {
  const repo=new AuthRepository(database);
  return {
    async createUser(user){
      const created=await repo.createUser({email:user.email,name:user.name,image:user.image,emailVerified:user.emailVerified??null});
      return toAdapterUser(created);
    },
    async getUser(id){
      const user=await repo.getUser(id);return user?toAdapterUser(user):null;
    },
    async getUserByEmail(email){
      const user=await repo.getUserByEmail(email);return user?toAdapterUser(user):null;
    },
    async getUserByAccount({provider,providerAccountId}){
      const user=await repo.getUserByAccount(provider,providerAccountId);return user?toAdapterUser(user):null;
    },
    async updateUser(user){
      const updated=await repo.updateUser({id:user.id,name:user.name,image:user.image,emailVerified:user.emailVerified??undefined});
      return toAdapterUser(updated);
    },
    async linkAccount(account){
      await repo.linkAccount({
        userId:account.userId,type:account.type,provider:account.provider,providerAccountId:account.providerAccountId,
        refresh_token:account.refresh_token,access_token:account.access_token,expires_at:account.expires_at,
        token_type:account.token_type,scope:account.scope,id_token:account.id_token,
        session_state:typeof account.session_state==='string'?account.session_state:account.session_state==null?null:JSON.stringify(account.session_state),
      });
      return account as AdapterAccount;
    },
    async unlinkAccount({provider,providerAccountId}){
      await repo.unlinkAccount(provider,providerAccountId);
    },
    async createSession(session){
      return repo.createSession(session) as Promise<AdapterSession>;
    },
    async getSessionAndUser(sessionToken){
      const value=await repo.getSessionAndUser(sessionToken);
      if(!value)return null;
      return {session:{sessionToken:value.session.sessionToken,userId:value.session.userId,expires:value.session.expires},user:toAdapterUser(value.user)};
    },
    async updateSession(session){
      return repo.updateSession({sessionToken:session.sessionToken,expires:session.expires});
    },
    async deleteSession(sessionToken){
      await repo.deleteSession(sessionToken);
    },
    async createVerificationToken(token){
      return repo.createVerificationToken(token) as Promise<VerificationToken>;
    },
    async useVerificationToken(token){
      return repo.useVerificationToken(token);
    },
  };
}
