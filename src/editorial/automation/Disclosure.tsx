import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import type {PublishedNews} from '../model';

/** Machine provenance must not be presented as a human editor's approval. */
export function AutomatedBriefDisclosure({item,locale}:{item:PublishedNews;locale:InterfaceLocale}){
  if(!Object.values(item.translationReview??{}).some(review=>review.state==='validated'))return null;
  const text={
    en:'AI-assisted brief, generated and checked against the attributed source facts. This is not on-site reporting or independent confirmation by the league. Corrections can be reported to the editorial team.',
    es:'Nota asistida por IA, generada y comprobada con los hechos de la fuente citada. No implica cobertura presencial ni confirmación independiente de la liga. Puedes comunicar correcciones a la redacción.',
    pt:'Nota assistida por IA, gerada e verificada com os fatos da fonte citada. Não implica cobertura presencial nem confirmação independente da liga. Correções podem ser comunicadas à redação.',
  }[publicLanguage(locale)];
  return <p className="ed-machine-disclosure">{text}</p>;
}
