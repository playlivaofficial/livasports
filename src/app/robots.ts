import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots {
  return process.env.VERCEL_ENV==='production'
    ? {rules:{userAgent:'*',allow:'/'},sitemap:'https://livasports.com/sitemap.xml'}
    : {rules:{userAgent:'*',disallow:'/'}};
}
