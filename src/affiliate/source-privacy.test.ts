import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
describe('partner configuration stays private',()=>{
  it('never seeds private tracking IDs or an active synthetic campaign from schema migrations',()=>{
    const activation=readFileSync('db/migrations/043_1xbet_affiliate_activation.sql','utf8');
    expect(activation).not.toMatch(/https:\/\/1xaff|INSERT INTO affiliate|affiliate_status='ACTIVE'/);
    for(const file of ['043_1xbet_affiliate_activation.sql','044_1xbet_match_inline_creative.sql','045_1xbet_home_top_banner.sql'])
      expect(readFileSync('db/migrations/'+file,'utf8')).not.toMatch(/Aff ID\s+\d|[?&](tag|site|ad)=\d|d_\d+m_\d+c_/);
  });
});
