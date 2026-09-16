import 'server-only';
import {auth} from './config';
import {authConfigured} from './database';
import {AuthRepository} from './repository';
import {authDatabase} from './database';

export async function currentUser(){
  if(!authConfigured())return null;
  const session=await auth();
  const id=session?.user?.id;
  if(!id)return null;
  return session.user;
}

export async function requireUser(){
  const user=await currentUser();
  return user;
}

export async function userProviders(userId:string):Promise<string[]> {
  return new AuthRepository(authDatabase()).listAccountProviders(userId);
}
