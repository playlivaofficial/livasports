import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import ts from 'typescript';

describe('V2 active deployment dependency boundary',()=>{
 it('cannot import any paid sports IO adapter, refresh runner or media renderer from a live route',()=>{
  const root=process.cwd(),visited=new Set<string>();
  const resolveImport=(from:string,name:string)=>{const base=name.startsWith('@/')?join(root,'src',name.slice(2)):name.startsWith('.')?resolve(dirname(from),name):null;return base&&[base,base+'.ts',base+'.tsx',base+'.js',join(base,'index.ts'),join(base,'index.tsx')].find(file=>existsSync(file)&&statSync(file).isFile());};
  function walk(file:string){if(visited.has(file))return;visited.add(file);
   const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
   function visit(node:ts.Node){let name:string|undefined;
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!('isTypeOnly' in node&&node.isTypeOnly)&&!('importClause' in node&&node.importClause?.isTypeOnly))name=node.moduleSpecifier.text;
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))name=node.arguments[0].text;
    if(name){expect(name).not.toBe('ffmpeg-static');const target=resolveImport(file,name);if(target)walk(target);}ts.forEachChild(node,visit);
   }visit(source);
  }
  function entrypoints(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isDirectory())entrypoints(file);else if(/^(page|route|layout|error|not-found)\.[jt]sx?$/.test(entry.name))walk(file);}}
  entrypoints(join(root,'src/app'));walk(join(root,'src/proxy.ts'));
  const reachable=[...visited].map(file=>relative(root,file).replaceAll('\\','/'));
  for(const file of reachable)expect(file).not.toMatch(/providers\/.*Adapter|ingestion\/FootballIngestionService|odds\/scheduler(?:-server)?\.ts|growth\/(?:service|.*renderer|scheduler-server)\.ts|seo-autopilot\/runner/);
  expect(reachable).toContain('src/v2/pages.tsx');expect(reachable).toContain('src/auth/config.ts');
 });
 it('has no active deployment cron or paid refresh package command',()=>{
  expect(JSON.parse(readFileSync('vercel.json','utf8')).crons).toEqual([]);
  expect(existsSync('.github/workflows/odds-refresh.yml')).toBe(false);
  const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;
  for(const command of ['sync:football','sync:sports','m5:refresh','m5:scheduled-refresh','growth:render-top5','growth:audio-library','cache:warm'])expect(scripts[command]).toBe('node scripts/v2-retired-command.mjs');
 });
});
