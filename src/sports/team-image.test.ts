import {describe,expect,it} from 'vitest';
import {verifiedTeamImage} from './team-image';

describe('verified team crests',()=>{
  it('accepts authorized team-specific artwork without substituting identities',()=>{
    const url='https://cdn.sportmonks.com/images/soccer/teams/9/239401.png';
    expect(verifiedTeamImage(url)).toBe(url);
  });
  it.each([null,undefined,'','broken','https://cdn.sportmonks.com/images/soccer/team_placeholder.png',
    'https://cdn.sportmonks.com/images/soccer/teams/default.png','http://cdn.sportmonks.com/images/soccer/teams/1/1.png',
    'https://other.example/images/soccer/teams/1/1.png','https://secret@cdn.sportmonks.com/images/soccer/teams/1/1.png'])('uses initials, not broken/generic/unlicensed images: %s',value=>{
    expect(verifiedTeamImage(value)).toBeNull();
  });
});
