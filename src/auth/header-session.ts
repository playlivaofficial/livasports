'use client';

type HeaderSession={user?:{name?:unknown;email?:unknown}}|null;
let pending:Promise<HeaderSession>|null=null;

/** Coalesce overlapping header mounts only, never cache a settled session.
 * Used from client effects: no server cache, persistence, TTL or auth decisions.
 * Later navigation/auth changes still perform the normal private session read. */
export function readHeaderSession():Promise<HeaderSession>{
  if(!pending){
    pending=fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'})
      .then(response=>response.ok?response.json() as Promise<HeaderSession>:null)
      .finally(()=>{pending=null;});
  }
  return pending;
}
