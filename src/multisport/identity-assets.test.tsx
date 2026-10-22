import React from 'react';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {identityAsset,identityAssets,identityRights} from './identity-assets';
import {IdentityLogo} from './IdentityLogo';
describe('reviewed sports identity registry',()=>{
 it('pins locally hosted bytes and source provenance',()=>{
  for(const asset of identityAssets){expect(asset.path).toMatch(/^\/sports-identities\/[a-z-]+\.png$/);expect(createHash('sha256').update(readFileSync('public'+asset.path)).digest('hex')).toBe(asset.sha256);expect(asset.source).toMatch(/^https:\/\/commons.wikimedia.org\/wiki\/File:/);}
  expect(identityRights.trademarkRights).toBe('not-granted');expect(identityRights.use).toBe('editorial-identification-only');
 });
 it('matches only exact identities within their competition',()=>{
  expect(identityAsset('liga-mx','Cruz Azul')?.id).toBe('cruz-azul');expect(identityAsset('peru-liga-1','Cruz Azul')).toBeUndefined();expect(identityAsset('liga-mx','Cruz')).toBeUndefined();expect(identityAsset('nba')).toBeUndefined();expect(identityAsset('bundesliga')?.id).toBe('bundesliga-wordmark');
 });
 it('never generates a replacement badge or affiliate link',()=>{
  expect(renderToStaticMarkup(<IdentityLogo competitionId="nfl"/>)).toBe('');
  const markup=renderToStaticMarkup(<IdentityLogo competitionId="bundesliga"/>);expect(markup).toContain('object-fit:contain');expect(markup).not.toContain('<a ');expect(markup).toContain('alt=""');
 });
});
