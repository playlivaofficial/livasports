import {getDomain} from 'tldts';
export const STATUSES=['NEW','RESEARCHED','READY_TO_CONTACT','CONTACTED','FOLLOW_UP','INTERESTED','LINK_LIVE','DECLINED','NO_RESPONSE','REJECTED'] as const;
export type Status=typeof STATUSES[number];
export const CATEGORIES=['FOOTBALL_MEDIA','CLUB_FAN','BETTING_EDITORIAL','DATA_ANALYTICS','NEWSLETTER_CREATOR','JOURNALIST','REGIONAL','MATCH_PREVIEW'] as const;
export type Category=typeof CATEGORIES[number];
export type Priority='HIGH'|'MEDIUM'|'LOW'|'REJECT';
export interface Research {
 country:string;language:string;brazil:boolean;football:boolean;odds:boolean;editorial:boolean;active:boolean;
 articleUrl:string;articleTitle:string;articleDate:string|null;sectionUrl:string;contactAlternative:string;
 evidenceUrl:string;checkedAt:string;audienceSignal:string;fit:string;linkability:string;
 spamFlags:string[];mentionStatus:'UNKNOWN'|'MENTION'|'LINK';competitorEvidence:string;
}
export interface Prospect {id:string;domain:string;name:string;category:Category;status:Status;priority:Priority;research:Research;
 contactUrl:string|null;email:string|null;targetUrl:string;angle:string;notes:string;lastContactAt:string|null;followUpOn:string|null;isQa:boolean;}
export const ANGLES=['DATA_CITATION','JOURNALIST_RESOURCE','MATCH_TOOL','CLUB_RESOURCE','NEWSLETTER','ARTICLE_UPDATE'] as const;
export type Angle=typeof ANGLES[number];
export interface EarnedLink {id:string;prospectId:string;domain:string;sourceUrl:string;targetUrl:string;state:'LIVE'|'REMOVED'|'REDIRECTED'|'UNKNOWN';anchor:string|null;rel:string|null;httpStatus:number|null;firstSeenAt:string|null;lastCheckedAt:string|null;isQa:boolean;}
export interface Referral {domain:string;landingPath:string;sessions:number;engaged:number;matchViews:number;odds:number;slipAdds:number;clicks:number;}
export interface AuthorityEvent {id:string;prospectId:string;kind:string;fromStatus:string|null;toStatus:string|null;note:string;occurredAt:string;}
export interface AuthorityReport {prospects:Prospect[];links:EarnedLink[];events:AuthorityEvent[];referrals:Referral[];runs:{day:string;state:string;requests:number;linksChecked:number;assetChecks?:{url:string;status:number|null}[]}[];generatedAt:string;}
export const METHODOLOGY='https://livasports.com/br/como-funciona-a-comparacao-de-odds';
export function publicUrl(value:unknown):string {
 if(typeof value!=='string'||value.length>2000)throw Error('INVALID_URL');
 let u:URL;try{u=new URL(value);}catch{throw Error('INVALID_URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!getDomain(u.hostname,{allowPrivateDomains:true})||/[^a-z0-9.-]/i.test(u.hostname)||u.hostname.endsWith('.')||/^\d+(\.\d+){3}$/.test(u.hostname))throw Error('INVALID_URL');
 if(/(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(u.hostname))throw Error('INVALID_URL');
 u.hash='';return u.toString();
}
export function domainOf(value:string){return getDomain(new URL(publicUrl(value)).hostname,{allowPrivateDomains:true})!;}
export function targetUrl(value:unknown){const url=publicUrl(value),u=new URL(url);if(u.hostname!=='livasports.com'||!/^\/(br|mx|en)(\/|$)/.test(u.pathname)||/\/go\/|\/api\/|\/owner\//.test(u.pathname))throw Error('INVALID_TARGET');for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_'))u.searchParams.delete(key);return u.toString();}
export function classify(r:Research,contact:boolean):{priority:Priority;reasons:string[]}{
 if(r.spamFlags.length)return {priority:'REJECT',reasons:r.spamFlags};
 const reasons=[r.brazil?'Público brasileiro':'Relevância BR não comprovada',r.football?'Futebol pertinente':'Futebol não comprovado',r.editorial?'Conteúdo editorial identificado':'Qualidade editorial pendente',r.active?'Atividade recente documentada':'Atividade recente não verificada',contact?'Contato público disponível':'Contato ainda não confirmado'];
 return {priority:r.brazil&&r.football&&r.editorial&&r.active&&contact?'HIGH':r.brazil&&r.football&&r.editorial?'MEDIUM':'LOW',reasons};
}
export function canTransition(from:Status,to:Status){
 if(from===to)return false;if(to==='REJECTED')return true;if(from==='REJECTED')return to==='RESEARCHED';
 const map:Record<Exclude<Status,'REJECTED'>,Status[]>={NEW:['RESEARCHED'],RESEARCHED:['READY_TO_CONTACT','LINK_LIVE'],READY_TO_CONTACT:['CONTACTED','RESEARCHED','LINK_LIVE'],CONTACTED:['FOLLOW_UP','INTERESTED','LINK_LIVE','DECLINED','NO_RESPONSE'],FOLLOW_UP:['CONTACTED','INTERESTED','LINK_LIVE','DECLINED','NO_RESPONSE'],INTERESTED:['CONTACTED','FOLLOW_UP','LINK_LIVE','DECLINED'],LINK_LIVE:['FOLLOW_UP'],DECLINED:['RESEARCHED'],NO_RESPONSE:['FOLLOW_UP','RESEARCHED']};
 return map[from].includes(to);
}
export function validFollowUp(value:unknown):string|null{if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('INVALID_FOLLOW_UP');return value;}
export function outreach(p:Pick<Prospect,'name'|'research'|'targetUrl'|'angle'>){
 const context=p.research.articleTitle?`Vi a pauta de vocês sobre ${p.research.articleTitle}.`:`Conheci a proposta editorial de ${p.name}.`;
 const variants:Record<Angle,{subject:string;pitch:string}>={
 DATA_CITATION:{subject:'Uma referência para contextualizar odds',pitch:'Reunimos uma metodologia pública para comparar cotações do mesmo mercado, com horários, limites de cobertura e distinção entre preço próprio e aproximado. Pode ajudar a contextualizar dados sem tratá-los como previsão.'},
 JOURNALIST_RESOURCE:{subject:'Recurso de consulta para a redação',pitch:'A LivaSports reúne partidas e comparação de odds. A metodologia explica as limitações para quem precisa conferir um dado antes de citá-lo. Não se trata de recomendação de aposta.'},
 MATCH_TOOL:{subject:'Consulta complementar para a prévia do jogo',pitch:'Esta página reúne informações da partida e, quando disponíveis, cotações identificadas por mercado e horário. Pode servir como consulta complementar à prévia; preços e cobertura mudam.'},
 CLUB_RESOURCE:{subject:'Uma referência para acompanhar a agenda do clube',pitch:'Este recurso permite acompanhar partidas e navegar pelo contexto da competição. Pensei que poderia ser útil como serviço ao leitor nas pautas sobre a próxima rodada.'},
 NEWSLETTER:{subject:'Sugestão de recurso para uma próxima edição',pitch:'Separei um recurso de consulta sobre futebol e comparação de odds, com metodologia e limites explícitos. Se combinar com a curadoria da newsletter, fica como sugestão editorial.'},
 ARTICLE_UPDATE:{subject:'Referência complementar para um artigo',pitch:'Tenho uma referência que pode complementar o contexto do artigo. Não estou presumindo erro nem link quebrado; a sugestão é apenas oferecer outra fonte de consulta, se fizer sentido editorial.'},
 };
 const v=variants[p.angle as Angle]??variants.DATA_CITATION;
 return {subject:v.subject,message:`Olá, equipe ${p.name}!\n\n${context}\n\n${v.pitch}\n\nRecurso: ${p.targetUrl}\n\nSe for útil, fico à disposição para esclarecer a metodologia. A decisão de citar é de vocês. Obrigado!\nEquipe LivaSports`,followUp1:`Olá, equipe ${p.name}! Retomo uma única vez a sugestão de recurso: ${p.targetUrl}. Se não combinar com a pauta, sem problema — encerro por aqui. Obrigado!`,followUp2:`Olá, equipe ${p.name}! Como vocês demonstraram interesse, deixo novamente o recurso: ${p.targetUrl}. Posso esclarecer algum ponto? (Usar somente após resposta/interesse; não enviar como lembrete automático.)`};
}
export function scorecard(report:AuthorityReport,now=new Date()){
 const ps=report.prospects.filter(p=>!p.isQa),links=report.links.filter(l=>!l.isQa),seven=now.getTime()-7*86400000;
 return {wins:links.filter(l=>l.state==='LIVE'&&l.firstSeenAt&&Date.parse(l.firstSeenAt)>=seven).map(l=>`Nova citação verificada: ${l.domain}`),
 watchlist:[...ps.filter(p=>['CONTACTED','FOLLOW_UP','INTERESTED'].includes(p.status)).map(p=>`${p.name}: ${p.status}`),...links.filter(l=>l.state==='LIVE'&&!report.referrals.some(r=>r.domain===l.domain&&r.sessions>0)).map(l=>`${l.domain}: link sem tráfego medido`)],
 issues:[...links.filter(l=>['REMOVED','REDIRECTED'].includes(l.state)).map(l=>`${l.domain}: ${l.state}`),...ps.filter(p=>p.priority==='REJECT').map(p=>`${p.domain}: excluído por risco`),...(report.runs[0]?.assetChecks??[]).filter(a=>a.status!==null&&a.status!==200).map(a=>`Ativo precisa de revisão: HTTP ${a.status} · ${a.url}`),...(report.runs[0]?.state==='FAILED'?['Última rodada do monitor falhou']:[]),...(ps.some(p=>['NEW','RESEARCHED','READY_TO_CONTACT'].includes(p.status))?[]:['Pipeline de prospecção vazio'])]};
}
