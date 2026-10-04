import { mkdirSync, existsSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
const base = '8093e0f06eb1a3f20cedd7f8c0b5a9be3b1b4fea';
const evidence = resolve('apps/shell/extensions/akari-shell-strip/evidence/en-3');
const baseline = resolve(evidence,'baseline');
const git = args => spawnSync('git', ['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{encoding:'utf8'});
mkdirSync(baseline,{recursive:true});
const scopes=['shell-strip','theme','tabs','companion','world-view'];
if (!existsSync(resolve(baseline,'.prepared'))) {
    const archive = resolve(evidence,'baseline.tar');
    const result=git(['archive',base,`--output=${archive}`,'apps/shell/tsconfig.base.json',...scopes.flatMap(name=>['src','test','tsconfig.json','package.json'].map(part=>`apps/shell/extensions/akari-${name}/${part}`))]);
    if(result.status!==0) throw new Error(result.stderr);
    const unpack=spawnSync('tar',['-xf',archive,'-C',baseline],{encoding:'utf8'});
    if(unpack.status!==0) throw new Error(unpack.stderr);
    for(const [from,to] of [['apps/shell/node_modules','apps/shell/node_modules'],['packages','packages']]) symlinkSync(resolve(root,from),resolve(baseline,to),'junction');
    for(const name of ['annotations','partner','transcript','project','preview','surfaces']) symlinkSync(resolve(root,`apps/shell/extensions/akari-${name}`),resolve(baseline,`apps/shell/extensions/akari-${name}`),'junction');
    writeFileSync(resolve(baseline,'.prepared'),'HEAD snapshot with shared installed dependencies');
}
for(const path of ['apps/shell/package.json','scripts/ci/run-unit-tests.mjs']) {
    const result=git(['show',`${base}:${path}`]);
    if(result.status!==0) throw new Error(result.stderr);
    mkdirSync(resolve(baseline,path,'..'),{recursive:true});
    writeFileSync(resolve(baseline,path),result.stdout);
}
const lane=process.argv[2] ?? 'shell-strip';
const suffix=process.argv[3] ?? '1';
const cwd=resolve(baseline,`apps/shell/extensions/akari-${lane}`);
const start=performance.now();
const result=spawnSync(process.env.ComSpec ?? 'cmd.exe',['/d','/s','/c','npm test'],{cwd,encoding:'utf8',maxBuffer:10_000_000});
const seconds=(performance.now()-start)/1000;
writeFileSync(resolve(evidence,`baseline-${lane}-${suffix}.log`),result.stdout+result.stderr);
const receipt={lane,base,seconds,exitCode:result.status};
writeFileSync(resolve(evidence,`baseline-${lane}-${suffix}.json`),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
