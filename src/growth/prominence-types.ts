export type GrowthSurface={kind:'HOME'}|{kind:'DAILY'}|{kind:'COMPETITION';slug:string}|{kind:'TEAM';teamId:string}|{kind:'MATCH';fixtureId:string};
export interface PriorityLink {fixtureId:string;rank:number;score:number;canonicalUrl:string;context:string;competition:string;competitionSlug:string;kickoff:string;home:string;away:string;homePublicId:string;awayPublicId:string;current:boolean;}
