/** Sanitized classifications only: never retain transport messages or publisher prose. */
export const primaryReviewReasons=['SCHEDULE_ATTACHMENT_REVIEW_REQUIRED','PRIMARY_ARTICLE_REVIEW_REQUIRED','SOURCE_PUBLICATION_EXPIRED','PRIMARY_ROBOTS_BLOCKED','PRIMARY_HTTP_REJECTED','PRIMARY_SIZE_LIMIT','PRIMARY_UNAVAILABLE','PRIMARY_HEADLINE_MISMATCH','PRIMARY_DATE_MISMATCH','PRIMARY_FACTS_UNVERIFIED'] as const;
export type PrimaryReviewReason=typeof primaryReviewReasons[number];
export function primaryFailure(error:unknown):PrimaryReviewReason{
 const code=error instanceof Error?error.message:'';
 if(primaryReviewReasons.includes(code as PrimaryReviewReason))return code as PrimaryReviewReason;
 if(/^HTTP_[0-9]{3}$/.test(code))return 'PRIMARY_HTTP_REJECTED';
 return code==='SIZE_LIMIT'?'PRIMARY_SIZE_LIMIT':'PRIMARY_UNAVAILABLE';
}
export function primaryDateEligible(sourceDate:string|null|undefined,now:Date){const date=Date.parse((sourceDate??'')+'T00:00:00Z');return Number.isFinite(date)&&date<=+now&&+now-date<=7*86400000;}
