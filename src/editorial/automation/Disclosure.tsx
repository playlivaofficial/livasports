import {publicLanguage,type InterfaceLocale} from '@/localization/interface';
import type {PublishedNews} from '../model';

/** Machine provenance must not be presented as a human editor's approval. */
export function AutomatedBriefDisclosure({item,locale}:{item:PublishedNews;locale:InterfaceLocale}){
  if(!Object.values(item.translationReview??{}).some(review=>review.state==='validated'))return null;
  const text={
    en:'AI-assisted result briefing, generated and checked against the attributed structured dataset. No match reporting or independent league confirmation is implied. Corrections can be reported to the editorial team.',
    es:'Nota de resultado asistida por IA, generada y comprobada con el conjunto de datos atribuido. No implica cobertura presencial ni confirmación independiente de la liga. Puedes comunicar correcciones a la redacción.',
    pt:'Nota de resultado assistida por IA, gerada e verificada com o conjunto de dados atribuído. Não implica cobertura presencial nem confirmação independente da liga. Correções podem ser comunicadas à redação.',
  }[publicLanguage(locale)];
  return <p className="ed-machine-disclosure">{text}</p>;
}
