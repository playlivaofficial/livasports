import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const policy=JSON.parse(readFileSync(new URL('../../ops/vercel/crawler-deny.json',import.meta.url),'utf8')) as {
  deniedPlatformBotNames:string[];
  deniedUserAgentTokens:string[];
  userAgentFallbackRule:{conditionGroup:{conditions:{type:string;op:string;value:string}[]}[];action:{mitigate:{action:string}}};
  desiredVerifiedIdentityRule:{conditionGroup:{conditions:{type:string;op:string;value:string[]}[]}[];action:{mitigate:{action:string}}};
};
const condition=policy.userAgentFallbackRule.conditionGroup[0].conditions[0];
const denied=new RegExp(condition.value);

describe('documented Vercel crawler cost policy',()=>{
  it('limits the deny policy to the seven approved platform identities',()=>{
    expect(policy.deniedPlatformBotNames).toEqual(['meta-externalagent','perplexitybot','gptbot','seranking-backlinks','dataforseobot','petalbot','claudebot']);
    expect(policy.deniedUserAgentTokens).toHaveLength(7);
    expect(new Set(policy.deniedUserAgentTokens).size).toBe(7);
    expect(condition).toMatchObject({type:'user_agent',op:'re'});
    expect(policy.userAgentFallbackRule.action.mitigate.action).toBe('deny');
  });
  it.each(policy.deniedUserAgentTokens)('denies the exact %s token in any case',token=>{
    for(const value of [token,token.toLowerCase(),token.toUpperCase()]){
      expect(denied.test(value)).toBe(true);
      expect(denied.test(`Mozilla/5.0 (compatible; ${value}/1.0)`)).toBe(true);
    }
  });
  it.each(policy.deniedUserAgentTokens)('does not widen %s into arbitrary prefix/suffix matches',token=>{
    for(const value of [`not${token}`,`${token}Preview`,`${token}-User`,`${token}_preview`])expect(denied.test(value)).toBe(false);
  });
  it.each(['Googlebot/2.1','bingbot/2.0','facebookexternalhit/1.1','Twitterbot/1.0','LinkedInBot/1.0','Slackbot-LinkExpanding 1.0','Discordbot/2.0','WhatsApp/2.25.1','Meta-ExternalFetcher/1.1','ChatGPT-User/1.0','OAI-SearchBot/1.0','Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'])('leaves allowed identity %s unaffected',agent=>expect(denied.test(agent)).toBe(false));
  it('records verified identity separately rather than claiming UA verification',()=>{
    expect(policy.desiredVerifiedIdentityRule.conditionGroup).toEqual([{conditions:[{type:'bot_name',op:'inc',value:policy.deniedPlatformBotNames}]}]);
    expect(policy.desiredVerifiedIdentityRule.action.mitigate.action).toBe('deny');
  });
});
