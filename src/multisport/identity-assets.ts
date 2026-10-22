/** Asset-specific copyright provenance does not grant trademark or sponsorship rights. */
export const identityAssets = [
 {id:'bundesliga-wordmark',kind:'competition',competitionId:'bundesliga',names:['Bundesliga'],path:'/sports-identities/bundesliga-wordmark.png',width:404,height:49,author:'DFL Deutsche Fußball Liga',source:'https://commons.wikimedia.org/wiki/File:Bundesliga_logo.svg',sha256:'020b7a9989ab0e08072ee0eb03830a426dccb495803db7c4d513c82c76936be7'},
 {id:'cruz-azul',kind:'team',competitionId:'liga-mx',names:['Cruz Azul','Club de Fútbol Cruz Azul'],path:'/sports-identities/cruz-azul.png',width:298,height:298,author:'Club de Fútbol Cruz Azul',source:'https://commons.wikimedia.org/wiki/File:Club_de_F%C3%BAtbol_Cruz_Azul_logo.svg',sha256:'e2584aed52e20d5f04698b5110b4445de1bf218565cabd95d2727e69522a75ea'},
] as const;
export type IdentityAsset = typeof identityAssets[number];
export const identityRights = {reviewedOn:'2026-10-22',copyrightBasis:'Commons PD-textlogo declaration',use:'editorial-identification-only',trademarkRights:'not-granted',transformation:'Rasterized without recoloring; natural aspect ratio preserved'} as const;
/** Exact aliases only: no fuzzy matching or arbitrary provider image URLs. */
export function identityAsset(competitionId:string,teamName?:string):IdentityAsset|undefined {
 return identityAssets.find(asset=>asset.competitionId===competitionId&&(teamName===undefined?asset.kind==='competition':asset.kind==='team'&&asset.names.some(name=>name===teamName)));
}
