import {describe,it,expect} from 'vitest';
import NextLink from 'next/link';
import SportsLink from './SportsLink';

describe('competition document navigation',()=>{
  it.each(['/br/futebol','/mx/futbol','/en/football'])('keeps the full query and accessible link props for %s',base=>{
    const href=base+'?competition=champions-league&season=recorded-season&tab=standings#table';
    const link=SportsLink({href,prefetch:false,'aria-current':'page',children:'Recorded season'});
    expect(link.type).toBe('a');expect(link.props.href).toBe(href);
    expect(link.props['aria-current']).toBe('page');expect(link.props.children).toBe('Recorded season');
    expect(link.props).not.toHaveProperty('prefetch');
  });
  it('retains normal framework navigation and prefetch controls for profile routes',()=>{
    const href='/en/player/recorded-player-0123456789abcdef';
    const link=SportsLink({href,prefetch:false,children:'Recorded player'});
    expect(link.type).toBe(NextLink);expect(link.props.href).toBe(href);expect(link.props.prefetch).toBe(false);
    expect(SportsLink({href:'/en/football-news',children:'News'}).type).toBe(NextLink);
  });
});
