import type {IncidentRecord} from './read';

export interface AlertMessage {subject:string;text:string;}
export type AlertTransport=(message:AlertMessage,to:string)=>Promise<void>;

/** Owner alert copy: operational, no secrets, no raw payloads. */
export function alertMessage(kind:'OPENED'|'ESCALATED'|'RESOLVED',incident:Pick<IncidentRecord,'competition'|'classification'|'severity'|'affectedFixtures'|'detail'|'openedAt'>,dashboardUrl:string):AlertMessage{
  const scope=incident.competition==='*'?'platform':incident.competition;
  const subject=`[LivaSports odds] ${kind==='RESOLVED'?'RESOLVED':incident.severity}: ${incident.classification} — ${scope}`;
  const evidence=typeof incident.detail?.evidence==='string'?incident.detail.evidence:'';
  const text=[`LivaSports odds reliability ${kind.toLowerCase()} notice`,'',`Scope: ${scope}`,`Classification: ${incident.classification}`,`Severity: ${incident.severity}`,
    `Affected fixtures: ${incident.affectedFixtures}`,`Opened: ${incident.openedAt}`,evidence?`Evidence: ${evidence}`:'',`Dashboard: ${dashboardUrl}`,'',
    'Runbook: docs/ODDS_RELIABILITY_SLO.md — "What do I do when the dashboard is red?"'].filter(Boolean).join('\n');
  return {subject,text};
}

/** Existing SMTP transport (the same one the magic-link sign-in uses); nothing new is provisioned. */
export const smtpAlertTransport:AlertTransport=async(message,to)=>{
  const nodemailer=(await import('nodemailer')).default;
  const transport=nodemailer.createTransport({host:process.env.AUTH_SMTP_HOST!,port:Number(process.env.AUTH_SMTP_PORT||'587'),auth:{user:process.env.AUTH_SMTP_USER!,pass:process.env.AUTH_SMTP_PASSWORD!},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000});
  await transport.sendMail({to,from:process.env.AUTH_EMAIL_FROM!,subject:message.subject,text:message.text});
};

/** Decide whether an incident transition deserves an owner e-mail (P3 §20: one incident → one open alert; follow-ups only on escalation or resolution). */
export function alertDecision(previous:{severity:'WARNING'|'CRITICAL';alertSeverity:string|null;state:string}|null,current:{severity:'WARNING'|'CRITICAL';state:string}):'OPENED'|'ESCALATED'|'RESOLVED'|null{
  if(current.state==='RESOLVED')return previous?.alertSeverity?'RESOLVED':null;
  if(current.severity!=='CRITICAL')return null;
  if(!previous||!previous.alertSeverity)return 'OPENED';
  if(previous.alertSeverity!=='CRITICAL')return 'ESCALATED';
  return null;
}

/** A dashboard-only or failed send is not delivery. Retry failures slowly, including across deployments. */
export function retryAlertDelivery(previous:{alert_channel?:string|null;alert_sent_at?:Date|string|null},now:Date,emailReady:boolean):boolean{
  if(!emailReady)return false;
  if(previous.alert_channel==='DASHBOARD')return true;
  if(previous.alert_channel!=='EMAIL_FAILED'&&previous.alert_channel!=='EMAIL_PENDING')return false;
  return !previous.alert_sent_at||now.getTime()-new Date(previous.alert_sent_at).getTime()>=30*60_000;
}
