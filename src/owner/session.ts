import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

type Environment=Readonly<Record<string,string|undefined>>;
export const ownerCookie='__Host-livasports_owner';
export const ownerSessionSeconds=30*24*60*60;
export interface OwnerSession {v:1;id:string;expiresAt:number;preview:boolean;}
const equalHex=(a:string,b:string)=>{const validA=/^[a-f0-9]{64}$/.test(a),validB=/^[a-f0-9]{64}$/.test(b);const left=Buffer.from(validA?a:'0'.repeat(64),'hex'),right=Buffer.from(validB?b:'0'.repeat(64),'hex');return timingSafeEqual(left,right)&&validA&&validB;};
const equalValue=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const normalizeOwnerAccessKey=(value:unknown)=>typeof value==='string'?value.trim():'';
export const accessKeyHash=(value:string)=>createHash('sha256').update(normalizeOwnerAccessKey(value),'utf8').digest('hex');
function secret(env:Environment){const value=env.OWNER_QA_SESSION_SECRET;return value&&value.length>=43&&/^[a-f0-9]{64}$/.test(env.OWNER_QA_ACCESS_HASH??'')?value:null;}
export function ownerConfigured(env:Environment=process.env){return !!secret(env);}
export function authorizedOwnerKey(value:unknown,env:Environment=process.env){const candidate=normalizeOwnerAccessKey(value),expected=env.OWNER_QA_ACCESS_HASH??'';const matches=equalHex(accessKeyHash(candidate),expected);return ownerConfigured(env)&&/^[A-Za-z0-9_-]{43,128}$/.test(candidate)&&matches;}
function mac(value:string,key:string,env:Environment){return createHmac('sha256',key).update('livasports:owner:v1:'+env.OWNER_QA_ACCESS_HASH+':'+value).digest('base64url');}
export function signOwnerSession(session:OwnerSession,env:Environment=process.env){const key=secret(env);if(!key)throw Error('OWNER_QA_NOT_CONFIGURED');const value=Buffer.from(JSON.stringify(session)).toString('base64url');return value+'.'+mac(value,key,env);}
export function newOwnerSession(now=Date.now()):OwnerSession{return {v:1,id:randomBytes(24).toString('base64url'),expiresAt:now+ownerSessionSeconds*1000,preview:false};}
export function requestOwnerSession(headers:Headers,env:Environment=process.env,now=Date.now()):OwnerSession|null{
  const key=secret(env);if(!key)return null;
  const values=(headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(ownerCookie+'='));if(values.length!==1)return null;
  const token=values[0].slice(ownerCookie.length+1);if(token.length>1024||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))return null;
  const [value,signature]=token.split('.');if(!equalValue(signature,mac(value,key,env)))return null;
  try{const p=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));return p.v===1&&typeof p.id==='string'&&/^[A-Za-z0-9_-]{32}$/.test(p.id)&&typeof p.preview==='boolean'&&Number.isSafeInteger(p.expiresAt)&&p.expiresAt>now&&p.expiresAt<=now+ownerSessionSeconds*1000&&Object.keys(p).length===4?p:null;}catch{return null;}
}
export function ownerPreview(headers:Headers,env:Environment=process.env){const session=requestOwnerSession(headers,env);return session?.preview?session:null;}
/** Offer grants are bound to the authenticated session without publishing its cookie. */
export function previewBinding(headers:Headers,env:Environment=process.env){const session=ownerPreview(headers,env),key=secret(env);return session&&key?createHmac('sha256',key).update('livasports:qa-offer:'+session.id).digest('base64url'):undefined;}
