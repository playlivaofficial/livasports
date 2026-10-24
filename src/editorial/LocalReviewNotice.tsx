import type {InterfaceLocale} from '@/localization/interface';
/** Server-only local development notice; no public GEO controls or environment values. */
export function LocalReviewNotice({locale}:{locale:InterfaceLocale}){
 if(process.env.NODE_ENV!=='development'||process.env.VERCEL)return null;
 return <aside className="v3-review-notice"><strong>LOCAL QA</strong><span>{locale==='en'?'Isolated local review · Not Production':locale==='br'?'Revisão local isolada · Não é Produção':'Revisión local aislada · No es Producción'}</span><a href="/owner/news">Owner ↗</a></aside>;
}
