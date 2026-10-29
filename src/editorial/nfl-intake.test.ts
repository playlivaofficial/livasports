import {describe,it,expect,vi} from 'vitest';
import {primaryFeedCandidates,collectPrimaryFeed} from './primary-feed-discovery';
const now=new Date('2026-10-29T12:00:00Z'),title="'A Cardinal Forever': Liam Example Inducted Into Ring Of Honor, No. 11 Retired";
const item=(headline:string,path:string,date='Mon, 26 Oct 2026 01:25:00 GMT')=>`<item><title>${headline}</title><link>https://www.azcardinals.com/news/${path}</link><pubDate>${date}</pubDate><description>No factual contract.</description></item>`;
const generic=Array.from({length:8},(_,i)=>item('Unverified generic commentary '+i,'story-'+i)).join('');
const xml=`<rss><channel>${generic}${item(title,'verified-honor')}</channel></rss>`;
const body="Liam Example, his name now officially on display within the Cardinals Ring of Honor. Example's name was unveiled.";
const article=(date='2026-10-26T01:25:00Z')=>`<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"${date}"}</script><article><h1>${title}</h1><div class="nfl-c-body-part--text"><p>${body}</p></div></article>`;
describe('NFL bounded contract-aware intake',()=>{
 it('finds a supported announcement below generic feed entries without growing retained metadata',()=>{const c=primaryFeedCandidates(xml,'nfl-cardinals',now);expect(c).toHaveLength(3);expect(c[0].headline).toBe(title);});
 it('keeps stale, future, unknown and beyond-30 announcements ineligible',()=>{for(const date of ['Mon, 19 Oct 2026 01:25:00 GMT','Fri, 30 Oct 2026 01:25:00 GMT'])expect(primaryFeedCandidates(`<rss><channel>${generic}${item(title,'verified-honor',date)}</channel></rss>`,'nfl-cardinals',now).some(c=>c.headline===title)).toBe(false);const many=Array.from({length:30},(_,i)=>item('Unknown statement '+i,'other-'+i)).join('');expect(primaryFeedCandidates(`<rss><channel>${many}${item(title,'verified-honor')}</channel></rss>`,'nfl-cardinals',now).some(c=>c.headline===title)).toBe(false);});
 it('still requires a matching fresh primary article, with three reads and no publisher text retained',async()=>{const f=vi.fn().mockResolvedValueOnce(new Response('User-agent: *\nAllow: /')).mockResolvedValueOnce(new Response(xml)).mockResolvedValueOnce(new Response(article()));const r=await collectPrimaryFeed('nfl-cardinals',f,now);expect(r.requests).toBe(3);expect(r.announcements).toHaveLength(1);expect(r.announcements?.[0].detail).toMatchObject({type:'team-honor',recipient:'Liam Example'});expect(JSON.stringify(r)).not.toContain(body);});
 it.each(['2026-10-25T01:25:00Z','2026-10-30T01:25:00Z','invalid'])('quarantines an article/feed date mismatch: %s',async date=>{const f=vi.fn().mockResolvedValueOnce(new Response('User-agent: *\nAllow: /')).mockResolvedValueOnce(new Response(xml)).mockResolvedValueOnce(new Response(article(date)));const r=await collectPrimaryFeed('nfl-cardinals',f,now);expect(r.announcements).toEqual([]);expect(r.status).toBe('PRIMARY_ARTICLE_QUARANTINED');});
});

