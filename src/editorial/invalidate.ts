import {revalidateTag,revalidatePath} from 'next/cache';
import {interfaceLocales} from '@/localization/interface';
import {newsCacheTag} from './server';
import {newsPath} from './copy';
import {sportsPath} from '@/multisport/catalog';
export function invalidateNews(){
  revalidateTag(newsCacheTag,{expire:0});
  for(const locale of interfaceLocales){revalidatePath(`/${locale}`);revalidatePath(newsPath(locale),'layout');revalidatePath(sportsPath(locale),'layout');}
  revalidatePath('/sitemap.xml');
}
