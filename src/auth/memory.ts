import {randomUUID} from 'node:crypto';
import type {QueryResult,QueryResultRow} from 'pg';

type User={id:string;email:string;email_normalized:string;email_verified_at:Date|null;name:string|null;image:string|null};
type Account={user_id:string;type:string;provider:string;provider_account_id:string};
type Session={user_id:string;session_token_hash:string;expires_at:Date};
type Token={identifier_normalized:string;token_hash:string;expires_at:Date};
type Rate={bucket_hash:string;window_started_at:Date;attempt_count:number;blocked_until:Date|null};

export class MemoryAuthDatabase {
  users:User[]=[];
  accounts:Account[]=[];
  sessions:Session[]=[];
  tokens:Token[]=[];
  rates:Rate[]=[];
  statements:{sql:string;params:unknown[]}[]=[];

  async query<Row extends QueryResultRow=QueryResultRow>(sql:string,params:unknown[]=[]):Promise<QueryResult<Row>> {
    this.statements.push({sql,params:[...params]});
    const text=sql.replace(/\s+/g,' ');
    const ok=(rows:object[])=>({rows,rowCount:rows.length,command:'SELECT',oid:0,fields:[]} as unknown as QueryResult<Row>);
    if(text.includes('INSERT INTO auth_users')){
      const [email,verified,name,image]=params as [string,Date|null,string|null,string|null];
      if(this.users.some(user=>user.email_normalized===email))return ok([]);
      const user:User={id:randomUUID(),email,email_normalized:email,email_verified_at:verified,name,image};
      this.users.push(user);
      return ok([user]);
    }
    if(text.includes('FROM auth_users WHERE id='))return ok(this.users.filter(user=>user.id===params[0]));
    if(text.includes('FROM auth_users WHERE email_normalized='))return ok(this.users.filter(user=>user.email_normalized===params[0]));
    if(text.includes('FROM auth_accounts a JOIN auth_users')){
      const account=this.accounts.find(row=>row.provider===params[0]&&row.provider_account_id===params[1]);
      const user=account?this.users.find(row=>row.id===account.user_id):undefined;
      return ok(user?[user]:[]);
    }
    if(text.includes('UPDATE auth_users SET')){
      const user=this.users.find(row=>row.id===params[0]);
      if(!user)return ok([]);
      user.name=params[1]==null?user.name:params[1] as string;
      user.image=params[2]==null?user.image:params[2] as string;
      user.email_verified_at=params[3]==null?user.email_verified_at:params[3] as Date;
      return ok([user]);
    }
    if(text.includes('INSERT INTO auth_accounts')){
      const [userId,type,provider,providerAccountId]=params as [string,string,string,string];
      if(this.accounts.some(row=>row.provider===provider&&row.provider_account_id===providerAccountId)){
        throw new Error('duplicate key value violates unique constraint "auth_accounts_provider_account"');
      }
      this.accounts.push({user_id:userId,type,provider,provider_account_id:providerAccountId});
      return ok([]);
    }
    if(text.includes('DELETE FROM auth_accounts')){
      this.accounts=this.accounts.filter(row=>!(row.provider===params[0]&&row.provider_account_id===params[1]));
      return ok([]);
    }
    if(text.includes('SELECT provider FROM auth_accounts')){
      return ok(this.accounts.filter(row=>row.user_id===params[0]).map(row=>({provider:row.provider})));
    }
    if(text.includes('INSERT INTO auth_sessions')){
      this.sessions.push({user_id:params[0] as string,session_token_hash:params[1] as string,expires_at:params[2] as Date});
      return ok([]);
    }
    if(text.includes('FROM auth_sessions s JOIN auth_users')){
      const session=this.sessions.find(row=>row.session_token_hash===params[0]);
      const user=session?this.users.find(row=>row.id===session.user_id):undefined;
      if(!session||!user)return ok([]);
      return ok([{session_id:session.session_token_hash,expires_at:session.expires_at,...user}]);
    }
    if(text.includes('UPDATE auth_sessions SET')){
      const session=this.sessions.find(row=>row.session_token_hash===params[0]);
      if(!session)return ok([]);
      if(params[1]!=null)session.expires_at=params[1] as Date;
      return ok([{user_id:session.user_id,expires_at:session.expires_at}]);
    }
    if(text.includes('DELETE FROM auth_sessions')){
      this.sessions=this.sessions.filter(row=>row.session_token_hash!==params[0]);
      return ok([]);
    }
    if(text.includes('DELETE FROM auth_verification_tokens WHERE identifier_normalized=$1 AND expires_at')){
      this.tokens=this.tokens.filter(row=>!(row.identifier_normalized===params[0]&&row.expires_at<=new Date()));
      return ok([]);
    }
    if(text.includes('INSERT INTO auth_verification_tokens')){
      const existing=this.tokens.find(row=>row.identifier_normalized===params[0]&&row.token_hash===params[1]);
      if(existing)existing.expires_at=params[2] as Date;
      else this.tokens.push({identifier_normalized:params[0] as string,token_hash:params[1] as string,expires_at:params[2] as Date});
      return ok([]);
    }
    if(text.includes('DELETE FROM auth_verification_tokens')&&text.includes('token_hash=$2')){
      const index=this.tokens.findIndex(row=>row.identifier_normalized===params[0]&&row.token_hash===params[1]&&row.expires_at>new Date());
      if(index<0)return ok([]);
      const [token]=this.tokens.splice(index,1);
      return ok([{expires_at:token!.expires_at}]);
    }
    if(text.includes('SELECT blocked_until FROM auth_email_login_rate_limits')){
      const row=this.rates.find(item=>item.bucket_hash===params[0]&&item.blocked_until&&item.blocked_until>new Date());
      return ok(row?[{blocked_until:row.blocked_until}]:[]);
    }
    if(text.includes('INSERT INTO auth_email_login_rate_limits')){
      const bucket=params[0] as string;
      const window=params[1] as number;
      const maximum=params[2] as number;
      const now=new Date();
      let row=this.rates.find(item=>item.bucket_hash===bucket);
      if(!row||row.window_started_at.getTime()<=now.getTime()-window*1000){
        row={bucket_hash:bucket,window_started_at:now,attempt_count:1,blocked_until:null};
        this.rates=this.rates.filter(item=>item.bucket_hash!==bucket);
        this.rates.push(row);
      }else row.attempt_count+=1;
      if(row.attempt_count>=maximum)row.blocked_until=new Date(now.getTime()+window*1000);
      return ok([{blocked_until:row.blocked_until}]);
    }
    throw new Error('UNHANDLED_SQL');
  }
}
