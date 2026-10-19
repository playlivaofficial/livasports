import type {InterfaceLocale} from '@/localization/interface';
import {leagues} from './leagues';
import {v2Path} from './routes';
export function competitionDisposition(locale:InterfaceLocale,slug:string,tab:string|null){
  if(tab&&tab!=='fixtures')return {status:410 as const,path:null};
  const league=leagues.find(item=>item.id===slug);
  return league?{status:301 as const,path:v2Path(locale,'leagues',league.id)}:{status:410 as const,path:null};
}
export function retiredHtml(locale:InterfaceLocale){
  const text=locale==='en'?{title:'Live coverage has been retired',body:'LivaSports now focuses on football stories, guides and browser tools. Historical records remain available at their original addresses.',link:'Explore football'}:locale==='br'?{title:'A cobertura ao vivo foi encerrada',body:'A LivaSports agora oferece histórias, guias e ferramentas de futebol. Os registros históricos continuam em seus endereços originais.',link:'Explorar futebol'}:{title:'La cobertura en vivo se ha retirado',body:'LivaSports ahora ofrece historias, guías y herramientas de fútbol. Los registros históricos siguen disponibles en sus direcciones originales.',link:'Explorar fútbol'};
  return `<!doctype html><html lang="${locale==='br'?'pt':locale==='en'?'en':'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${text.title} | LivaSports</title><style>body{margin:0;background:#f8fafc;color:#14222c;font:17px/1.7 Arial,sans-serif}main{max-width:640px;margin:12vh auto;padding:28px}h1{font-size:clamp(30px,6vw,44px);line-height:1.1}a{display:inline-flex;min-height:48px;align-items:center;padding:8px 20px;background:#20df82;color:#073b23;border-radius:9px;text-decoration:none;font-weight:bold}</style></head><body><main><strong>LIVASPORTS</strong><h1>${text.title}</h1><p>${text.body}</p><a href="${v2Path(locale,'football')}">${text.link} →</a></main></body></html>`;
}
