const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {createRequire}=require('node:module');
exports.loadServer=t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'us-stock-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const serverPath=path.resolve(__dirname,'../src/server.js');
  const context=vm.createContext({require:createRequire(serverPath),__dirname:path.join(directory,'src'),
    process:{env:{STOCK_DATA_DIR:path.join(directory,'data')},uptime:()=>0},console,Buffer,URL,AbortController,
    setTimeout,clearTimeout,fetch:()=>{throw new Error('Unexpected network access');}});
  vm.runInContext(fs.readFileSync(serverPath,'utf8').replace(/app\.listen\(PORT,[\s\S]*$/,''),context);
  return {directory,run:code=>vm.runInContext(code,context)};
};
exports.loadBrowser=()=>{
  const storage=new Map();
  const nodes=new Map();
  const document={readyState:'loading',head:{appendChild(){}},addEventListener(){},querySelectorAll:()=>[],createElement:()=>({textContent:'',innerHTML:''}),
    getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'20',innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}}});return nodes.get(id);}};
  const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const context=vm.createContext({localStorage,document,window:{addEventListener(){}},console,Date,Intl,URL,Blob,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},navigator:{},fetch:()=>Promise.reject(new Error('No network'))});
  const html=fs.readFileSync(path.resolve(__dirname,'../public/index.html'),'utf8');
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/market-session.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../public/paper-storage.js'),'utf8'),context);
  vm.runInContext('window.US_PAPER_OWNER=true',context);
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).join('\n');
  vm.runInContext(scripts,context);
  return {storage,run:code=>vm.runInContext(code,context)};
};
