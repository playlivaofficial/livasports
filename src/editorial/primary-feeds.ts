/** Publisher-advertised RSS for private citation discovery, NOT a syndication licence.
 * Full text, photographs and feed descriptions are deliberately discarded.
 * No item from these desks is eligible for automatic publication without fact/rights review.
 */
export const primaryFeedDesks=[
 {id:'nba-releases',sport:'basketball',competition:'nba',country:'international',name:'NBA Communications',url:'https://pr.nba.com/feed/'},
 // DIMAYOR's feed also includes cups and women's football: never force all items into Primera A.
 {id:'dimayor-releases',sport:'football',competition:'football-news',country:'co',name:'DIMAYOR',url:'https://dimayor.com.co/feed/'},
] as const;
