/** Metadata only. CC BY attribution is retained; images and event facts are not licensed/verified by registration. */
export const licensedDiscoveryDesks=[
 {id:'wikinews-football',sport:'football',category:'Football'},
 {id:'wikinews-basketball',sport:'basketball',category:'Basketball'},
 {id:'wikinews-baseball',sport:'baseball',category:'Baseball'},
 {id:'wikinews-nfl',sport:'american-football',category:'American football'},
 {id:'wikinews-hockey',sport:'ice-hockey',category:'Ice hockey'},
 {id:'wikinews-mma',sport:'mma',category:'Mixed martial arts'},
 {id:'wikinews-tennis',sport:'tennis',category:'Tennis'},
] as const;
export function licensedDiscoveryUrl(id:string){
 const desk=licensedDiscoveryDesks.find(d=>d.id===id);if(!desk)throw Error('SOURCE_NOT_APPROVED');
 const url=new URL('https://en.wikinews.org/w/api.php');
 url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'categorymembers',gcmtitle:'Category:'+desk.category,gcmsort:'timestamp',gcmdir:'desc',gcmlimit:'10',gcmnamespace:'0',prop:'categories',cllimit:'50',maxlag:'5'}).toString();return url.href;
}
