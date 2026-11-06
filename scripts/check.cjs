const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const files=['src/server.js','public/paper-storage.js','public/market-session.js',
  ...fs.readdirSync(path.join(root,'lib')).filter(name=>name.endsWith('.cjs')).map(name=>'lib/'+name)];
for(const file of files)new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
for(const [index,script] of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries())new vm.Script(script[1],{filename:'public/index.html:inline-'+index});
console.log('Active server, browser modules, inline dashboard scripts and libraries parse successfully.');
