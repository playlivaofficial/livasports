import type {MetadataRoute} from 'next';
import {robotsDisallow,siteOrigin} from '@/seo/policy';
export function robotsForEnvironment(environment:string|undefined):MetadataRoute.Robots{
  // Preview/development deployments are never crawlable; production allows every public sports URL
  // (including ?competition= query identities) and only fences tracking, API and owner tooling.
  return environment==='production'
    ? {rules:{userAgent:'*',allow:'/',disallow:[...robotsDisallow]},sitemap:[`${siteOrigin}/sitemap.xml`,`${siteOrigin}/sports-sitemaps.xml`]}
    : {rules:{userAgent:'*',disallow:'/'}};
}
export default function robots():MetadataRoute.Robots{return robotsForEnvironment(process.env.VERCEL_ENV);}
