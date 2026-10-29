import {describe,it,expect,vi} from 'vitest';
import {collectPrimaryFeed} from './primary-feed-discovery';
import {extractAnnouncement,announcementErrors} from './automation/announcements';
const now=new Date('2026-10-22T08:00:00Z');
const headline='Chad Ryland Named NFC Special Teams Player Of The Week After Booting Rams';
const url='https://azcardinals.com/news/chad-ryland-named-nfc-special-teams-player-of-the-week-after-booting-rams';
const candidate={desk:'nfl-cardinals',headline,url,sourceDate:'2026-10-21'};
// Minimal factual test assertions, not a stored copy of the publisher article.
const body='Chad Ryland is the subject. NFC Special Teams Player of the Week, which the NFL bestowed upon Ryland on Wednesday.';
const xml=`<rss><channel><item><title>${headline}</title><link>${url}</link><pubDate>Wed, 21 Oct 2026 16:00:13 GMT</pubDate><description>Short headline metadata alone is insufficient.</description></item></channel></rss>`;
const html=`<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-21T16:00:13Z"}</script><main><article><h1>${headline}</h1><div class="nfl-c-body-part--text"><p>${body}</p></div></article></main>`;
describe('bounded official NFL club award facts',()=>{
 it('retains only the corroborated recipient and award, never scores or copied prose',()=>{
  const facts=extractAnnouncement(candidate,body,now)!;
  expect(facts.detail).toEqual({type:'award',recipient:'Chad Ryland',award:'NFC Special Teams Player of the Week',period:'weekly'});
  expect(facts).toMatchObject({competition:'nfl',sport:'american-football',country:'international'});
  expect(announcementErrors(facts,now)).toEqual([]);
  expect(JSON.stringify(facts)).not.toContain('Wednesday');
  const roundTrip=JSON.parse(JSON.stringify(facts));roundTrip.detail=Object.fromEntries(Object.entries(roundTrip.detail).reverse());
  expect(announcementErrors(roundTrip,now)).toEqual([]);
 });
 it('rejects missing body corroboration, conflicts, stale dates, and foreign source identities',()=>{
  for(const text of ['',headline,body.replace('upon Ryland','upon Somebody'),body+' He was not awarded the honor.'])expect(extractAnnouncement(candidate,text,now)).toBeNull();
  expect(extractAnnouncement({...candidate,sourceDate:'2025-10-21'},body,now)).toBeNull();
  expect(extractAnnouncement({...candidate,url:'https://other.example/news/test'},body,now)).toBeNull();
 });
 it('uses at most robots, feed and one exact article without retries',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('User-agent: *\nAllow: /')).mockResolvedValueOnce(new Response(xml)).mockResolvedValueOnce(new Response(html));
  const result=await collectPrimaryFeed('nfl-cardinals',fetcher,now);
  expect(result.requests).toBe(3);expect(result.announcements).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(3);
  expect(String(fetcher.mock.calls[2][0])).toBe(url.replace('https://','https://www.'));
 });
 it('does not infer article permission from feed permission',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('User-agent: *\nDisallow: /news/')).mockResolvedValueOnce(new Response(xml));
  const result=await collectPrimaryFeed('nfl-cardinals',fetcher,now);
  expect(result.status).toBe('ROBOTS_BLOCKED');expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('keeps an article with a changed headline private and stops after an upstream failure',async()=>{
  const mismatch=vi.fn().mockResolvedValueOnce(new Response('User-agent: *\nAllow: /')).mockResolvedValueOnce(new Response(xml)).mockResolvedValueOnce(new Response(html.replace(headline,'Changed story')));
  expect((await collectPrimaryFeed('nfl-cardinals',mismatch,now)).announcements).toEqual([]);
  const failed=vi.fn().mockResolvedValueOnce(new Response('User-agent: *\nAllow: /')).mockResolvedValueOnce(new Response(xml)).mockResolvedValueOnce(new Response('',{status:503}));
  expect((await collectPrimaryFeed('nfl-cardinals',failed,now)).status).toBe('HTTP_503');expect(failed).toHaveBeenCalledTimes(3);
 });
});
