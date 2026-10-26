import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';

describe('bounded dense sports navigation',()=>{
 it.each(['components','CompetitionExperience','BasketballDirectory','AmericanExperience','BasketballExperience','IndividualExperience'])('%s keeps links crawlable without speculative route generation',name=>{
  const path=`src/multisport/${name}.tsx`,source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let count=0;
  function visit(node:ts.Node){
   if((ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node))&&node.tagName.getText(source)==='Link'){
    count++;const attributes=node.attributes.properties.filter(ts.isJsxAttribute);
    expect(attributes.some(a=>a.name.getText(source)==='href')).toBe(true);
    const prefetch=attributes.find(a=>a.name.getText(source)==='prefetch')?.initializer;
    expect(prefetch&&ts.isJsxExpression(prefetch)&&prefetch.expression?.kind===ts.SyntaxKind.FalseKeyword).toBe(true);
   }ts.forEachChild(node,visit);
  }visit(source);expect(count).toBeGreaterThan(0);
 });
});
