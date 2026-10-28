import type {InterfaceLocale} from '@/localization/interface';
import {reviewedDimayorSchedule} from './automation/schedule-attachments';
/** Cite the exact visually reviewed primary attachment; never substitute unverified PDF contents. */
export function SourceAttachment({sourceUrl,locale}:{sourceUrl:string;locale:InterfaceLocale}){
 if(sourceUrl.replace(/\/$/,'')!==reviewedDimayorSchedule.sourceArticle)return null;
 const label=locale==='en'?'Official schedule attachment · 2 pages':locale==='br'?'Anexo oficial da programação · 2 páginas':'Adjunto oficial de la programación · 2 páginas';
 return <p><a href={reviewedDimayorSchedule.url} rel="noopener noreferrer">{label} ↗</a></p>;
}
