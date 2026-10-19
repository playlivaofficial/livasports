export const dynamic='force-static';
export function GET(){return new Response(null,{status:301,headers:{Location:'https://livasports.com/sitemap.xml','Cache-Control':'public, max-age=86400'}});}
