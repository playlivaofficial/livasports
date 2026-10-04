import {describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {configureCampaign,type CampaignConfiguration} from './configuration';
import type {DatabaseClient,QueryExecutor} from '@/database/client';

describe('maintenance campaign updates',()=>{
  it('shares one transaction with signed-offer revision invalidation and audit history',async()=>{
    const config:CampaignConfiguration={bookmaker:'codere',locale:'co',operatorCampaignId:'approved',destinationUrl:'https://codere.com.co/?campaign=approved',destinationType:'SPORTSBOOK',enabled:true,validFrom:'2026-01-01',validUntil:'2099-01-01',placements:['match_odds_table'],domains:['codere.com.co'],approvalReference:'Synthetic approved test configuration'};
    const query=vi.fn(async(sql:string)=>({rows:sql.startsWith('SELECT b.id')?[{bookmaker_id:'book',country_id:'country',destination_domains:['codere.com.co']}]:sql.includes('RETURNING g.bookmaker_id')?[{bookmaker_id:'book',country_id:'country',commercial_version:5}]:sql.includes('RETURNING id')?[{id:'campaign'}]:[],rowCount:1}));
    const transaction=vi.fn(async(fn:(q:QueryExecutor)=>Promise<unknown>)=>fn({query} as unknown as QueryExecutor));
    await configureCampaign({query,transaction,close:async()=>{}} as unknown as DatabaseClient,config);
    expect(transaction).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([sql])=>sql.includes('commercial_version=commercial_version+1'))).toBe(true);
    expect(query.mock.calls.some(([sql])=>sql.includes("'RECONFIGURE'"))).toBe(true);
    expect(query.mock.calls.find(([sql])=>sql.startsWith('SELECT b.id'))?.[0]).toContain('operator_provider_mappings');
  });
});
