import 'server-only';
import {revalidatePath,revalidateTag} from 'next/cache';
import {interfaceLocales} from '@/localization/interface';
import {sportsCacheTag} from './server';
export function invalidateSports(){revalidateTag(sportsCacheTag,{expire:0});for(const locale of interfaceLocales)revalidatePath(`/${locale}`,'layout');revalidatePath('/sitemap.xml');}
