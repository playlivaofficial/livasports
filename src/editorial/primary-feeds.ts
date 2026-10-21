/** Publisher-advertised RSS, NOT a syndication licence.
 * Text is transiently inspected by narrow fact extractors, never retained or supplied to AI.
 * Only corroborated source-specific announcement facts qualify; all other items stay private.
 */
export const primaryFeedDesks=[
 {id:'nba-releases',sport:'basketball',competition:'nba',country:'international',name:'NBA Communications',url:'https://pr.nba.com/feed/'},
 // DIMAYOR's feed also includes cups and women's football: never force all items into Primera A.
 {id:'dimayor-releases',sport:'football',competition:'football-news',country:'co',name:'DIMAYOR',url:'https://dimayor.com.co/feed/'},
] as const;
