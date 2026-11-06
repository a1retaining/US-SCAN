const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const URLS=[
  'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt',
  'https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'
];
function parseDirectory(text,kind){
  const lines=text.trim().split(/\r?\n/);
  const header=lines.shift().split('|');
  const field=(row,key)=>row[header.indexOf(key)];
  const out=[];
  if(!header.includes(kind==='nasdaq'?'Symbol':'ACT Symbol')||!header.includes('Test Issue')||!header.includes('ETF'))throw new Error('Unrecognised US symbol directory format');
  for(const line of lines){
    if(line.startsWith('File Creation Time:'))continue;
    const row=line.split('|');
    if(row.length!==header.length||field(row,'Test Issue')!=='N')continue;
    const original=field(row,kind==='nasdaq'?'Symbol':'ACT Symbol');
    const symbol=String(original||'').replace(/\.([A-Z]{1,2})$/,'-$1');
    if(!/^[A-Z]{1,6}(?:-[A-Z]{1,2})?$/.test(symbol))continue;
    const name=field(row,'Security Name')||'';
    const ordinary=/common stock|common shares|ordinary shares|american depositary shares|american depositary receipts/i.test(name)&&
      !/warrant|\bright\b|\brights\b|\bunit\b|\bunits\b|preferred|\bnotes\b|debenture|\bfund\b/i.test(name);
    out.push({classification:field(row,'ETF')==='Y'?'ETF':ordinary?'ordinary-stock-or-ADR':'unclassified',financialStatus:kind==='nasdaq'?field(row,'Financial Status'):'unknown',symbol,directorySymbol:original,name:field(row,'Security Name'),type:field(row,'ETF')==='Y'?'ETF':'EQUITY',
      exchange:kind==='nasdaq'?'NASDAQ':field(row,'Exchange'),testIssue:false});
  }
  return out;
}
function createDirectory({fetchText,directoryPath}){
  let cached=null,pending=null;
  function unpack(record,now){
    if(!record||!Array.isArray(record.raw)||record.raw.length!==2||Date.parse(record.retrievedAt)>now+60000||now-Date.parse(record.retrievedAt)>86400000)throw new Error('US listing verification is stale');
    const digest=createHash('sha256').update(record.raw.join('\n')).digest('hex');
    if(digest!==record.hash)throw new Error('US listing snapshot failed its hash check');
    for(const text of record.raw){
      const footer=text.match(/File Creation Time:\s*(\d{2})(\d{2})(\d{4})/);
      if(!footer)throw new Error('US directory lacks a source creation date');
      const sourceDate=Date.UTC(Number(footer[3]),Number(footer[1])-1,Number(footer[2]));
      if(now-sourceDate>4*86400000||sourceDate-now>86400000)throw new Error('US source directory creation date is stale or invalid');
    }
    const items=record.raw.flatMap((text,index)=>parseDirectory(text,index===0?'nasdaq':'other'));
    if(items.length<1000)throw new Error('US listing directory is incomplete');
    return {retrievedAt:record.retrievedAt,hash:record.hash,items:new Map(items.map(item=>[item.symbol,item]))};
  }
  async function get(){
    const now=Date.now();
    if(cached&&now-Date.parse(cached.retrievedAt)<86400000)return cached;
    if(pending)return pending;
    pending=(async()=>{
      if(fs.existsSync(directoryPath)){
        const files=fs.readdirSync(directoryPath).filter(name=>/^\d{13}-[a-f0-9]{64}\.json$/.test(name)).sort().reverse();
        for(const filename of files.slice(0,5)){
          try{cached=unpack(JSON.parse(fs.readFileSync(path.join(directoryPath,filename),'utf8')),now);return cached;}
          catch{}
        }
      }
      const raw=await Promise.all(URLS.map(url=>fetchText(url)));
      const record={retrievedAt:new Date().toISOString(),urls:URLS,raw,hash:createHash('sha256').update(raw.join('\n')).digest('hex')};
      cached=unpack(record,Date.now());
      fs.mkdirSync(directoryPath,{recursive:true});
      fs.writeFileSync(path.join(directoryPath,Date.now()+'-'+record.hash+'.json'),JSON.stringify(record),{flag:'wx',mode:0o600});
      return cached;
    })();
    try{return await pending;}finally{pending=null;}
  }
  return {get};
}
module.exports={createDirectory,parseDirectory};
