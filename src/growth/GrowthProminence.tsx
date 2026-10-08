import 'server-only';
import type {InterfaceLocale} from '@/localization/interface';
import {geoForLocale,isCoreGeo,type Geo} from '@/config/geo';
import {readPriorityLinks} from './prominence-read';
import type {GrowthSurface} from './prominence-types';
import {GrowthExperience} from './GrowthExperience';

/** Country editorial links remain crawlable in ISR; private hydration selects visitor GEO. */
export async function GrowthProminence({locale,surface,productGeo}:{locale:InterfaceLocale;surface:GrowthSurface;productGeo?:Geo}){
  const geo=productGeo??geoForLocale(locale);
  const rows=isCoreGeo(geo)?await readPriorityLinks(surface,geo).catch(()=>[]):[];
  return <GrowthExperience locale={locale} surface={surface} initialGeo={geo} initialRows={rows}/>;
}
