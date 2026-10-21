/** Approved for manual primary-source citation only, not syndication or data ingestion. */
export const editorialSourcePolicy={mode:'manual-original-summaries-only',automaticFetching:false,fullArticleCopying:false,sourceStatus:'Source not checked'} as const;
export const officialSourceHosts=[
  'fmf.mx','miseleccion.mx','ligamx.net','ligabbvaexpansion.mx','leaguescup.com','dimayor.com.co','fpf.org.pe','liga1.pe','liga2.pe','lfpp.pe',
  'fifa.com','inside.fifa.com','conmebol.com','gol.conmebol.com','concacaf.com','uefa.com','premierleague.com','laliga.com','legaseriea.it','bundesliga.com','ligue1.com','cafonline.com','oceaniafootball.com','copaamerica.com','theifab.com',
  'nba.com','pr.nba.com','euroleaguebasketball.net','mlb.com','nfl.com','houstontexans.com','nhl.com','ufc.com','atptour.com','wtatennis.com','ausopen.com','rolandgarros.com','wimbledon.com','usopen.org','daviscup.com','billiejeankingcup.com',
] as const;
export const editorialSourceRegistry=officialSourceHosts.map(host=>({host,sourceUrl:`https://${host}/`,mode:editorialSourcePolicy.mode,contentReuse:'No syndication, full-article, photo, logo or statistics-feed license granted.'}));

export function validSourceUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>1000||/[\s\\\u0000-\u001f\u007f]/.test(value))return false;
  // Fixed structured ODbL result citations only; not blanket article-reuse permission.
  if(/^https:\/\/api\.openligadb\.de\/getmatchdata\/\d+$/.test(value))return true;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&officialSourceHosts.some(host=>url.hostname===host||url.hostname===`www.${host}`);}catch{return false;}
}
/** Collapse only safe aliases: www, trailing slash, URL dot segments and unreserved escapes.
 * Path case and encoded reserved separators are meaningful and are not collapsed.
 * No request is made and redirects are not followed.
 */
export function canonicalSourceUrl(value:unknown):string|null {
  if(!validSourceUrl(value))return null;
  const url=new URL(value),host=url.hostname.replace(/^www\./,'');
  const path=url.pathname.replace(/%[0-9a-f]{2}/gi,encoded=>{const decoded=String.fromCharCode(parseInt(encoded.slice(1),16));return /[A-Za-z0-9\-._~]/.test(decoded)?decoded:encoded.toUpperCase();}).replace(/\/+$/,'')||'/';
  return `https://${host}${path}`;
}
