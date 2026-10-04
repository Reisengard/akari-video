import { cpSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const evidence=resolve('apps/shell/extensions/akari-shell-strip/evidence/en-3');
const fixture=resolve(evidence,'wording-fixture');
mkdirSync(resolve(fixture,'scripts/english-wording'),{recursive:true});
cpSync('scripts/english-wording/EN-3.json',resolve(fixture,'scripts/english-wording/EN-3.json'));
for(const name of ['shell-strip','theme','tabs','companion','world-view']) {
    const path=`apps/shell/extensions/akari-${name}`;
    for(const name of readdirSync(path)) {
        if(['lib','node_modules','evidence','dist'].includes(name)) continue;
        cpSync(`${path}/${name}`,resolve(fixture,path,name),{recursive:true});
    }
}
const result=spawnSync(process.execPath,['scripts/check-english-wording.mjs',fixture],{encoding:'utf8'});
writeFileSync(resolve(evidence,'wording-slice.log'),result.stdout+result.stderr);
console.log(result.stdout.trim());
process.exitCode=result.status;
