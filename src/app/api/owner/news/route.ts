import {revalidateTag,revalidatePath} from 'next/cache';
import {interfaceLocales} from '@/localization/interface';
import {newsroomRequest} from '@/editorial/http';
import {withNewsRepository,newsCacheTag} from '@/editorial/server';
import {newsPath} from '@/editorial/copy';
import {sportsPath} from '@/multisport/catalog';
export const dynamic='force-dynamic';
const handle=(request:Request)=>newsroomRequest(request,{withRepository:withNewsRepository,invalidate:slug=>{
  revalidateTag(newsCacheTag,{expire:0});
  for(const locale of interfaceLocales){revalidatePath(`/${locale}`);revalidatePath(newsPath(locale));revalidatePath(newsPath(locale,slug));revalidatePath(sportsPath(locale),'layout');}
  revalidatePath('/sitemap.xml');
}});
export const GET=handle;
export const POST=handle;
