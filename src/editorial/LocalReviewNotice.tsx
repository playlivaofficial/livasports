import type {InterfaceLocale} from '@/localization/interface';
/** Server-only local development notice; no public GEO controls or environment values. */
export function LocalReviewNotice({locale}:{locale:InterfaceLocale}){
 if(process.env.NODE_ENV!=='development'||process.env.VERCEL)return null;
 return <aside className="v3-review-notice"><strong>V3 · DRAFT PR #75</strong><span>{locale==='en'?'Isolated local review · Production remains V2':locale==='br'?'Revisão local isolada · Produção continua V2':'Revisión local aislada · Producción sigue en V2'}</span><a href="/owner/news">Owner ↗</a></aside>;
}
