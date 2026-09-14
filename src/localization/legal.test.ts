import {expect,it} from 'vitest';
import {legalKind,legalKinds,legalPath} from './legal-routes';
import {translatedPath} from './interface';
import {legalContent,officialSafetySources} from './legal-content';
it('gives all twelve informational pages reciprocal language switching',()=>{
  for(const locale of ['br','mx','en'] as const)for(const kind of legalKinds){
    const path=legalPath(locale,kind);expect(legalKind(locale,path.split('/')[2])).toBe(kind);
    for(const target of ['br','mx','en'] as const)expect(translatedPath(path,target)).toBe(legalPath(target,kind));
    expect(legalContent[locale][kind].title.length).toBeGreaterThan(4);expect(legalContent[locale][kind].sections.length).toBeGreaterThanOrEqual(3);
  }
  expect(legalKind('br','privacy')).toBeNull();expect(legalKind('en','unknown')).toBeNull();
});
it('links harm-prevention resources directly to public Brazilian services without affiliate parameters',()=>{
  for(const source of Object.values(officialSafetySources)){const url=new URL(source);expect(url.protocol).toBe('https:');expect(url.hostname).toBe('www.gov.br');expect(url.search).toBe('');}
});
