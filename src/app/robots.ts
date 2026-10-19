import type {MetadataRoute} from 'next';
import {robotsDisallow,siteOrigin} from '@/seo/policy';
export function robotsForEnvironment(environment:string|undefined):MetadataRoute.Robots{
  // Retired URLs stay crawlable so engines can observe 301/404/410. Preview stays blocked.
  return environment==='production'
    ? {rules:{userAgent:'*',allow:'/',disallow:[...robotsDisallow]},sitemap:[`${siteOrigin}/sitemap.xml`]}
    : {rules:{userAgent:'*',disallow:'/'}};
}
export default function robots():MetadataRoute.Robots{return robotsForEnvironment(process.env.VERCEL_ENV);}
