(function(){
  'use strict';
  let token='',busy=false;
  const node=id=>document.getElementById(id);
  const text=(id,value)=>{const n=node(id);if(n)n.textContent=value;};
  const usd=value=>Number.isFinite(value)?'$'+value.toFixed(2):'Unavailable';
  const time=value=>value?new Date(value).toLocaleString(undefined,{timeZoneName:'short'}):'Not yet';
  function rows(id,items,columns){
    const body=node(id);body.replaceChildren();
    if(!items.length){const row=body.insertRow(),cell=row.insertCell();cell.colSpan=columns.length;cell.textContent='None recorded.';return;}
    for(const item of items){const row=body.insertRow();for(const column of columns){const cell=row.insertCell(),value=column(item);if(value instanceof Node)cell.appendChild(value);else cell.textContent=String(value);}}
  }
  function details(item){
    const button=document.createElement('button');button.textContent='Download details';button.addEventListener('click',()=>{
      const blob=new Blob([JSON.stringify({purpose:'Research proposal for independent manual review; no broker submission',...item},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=item.symbol+'-'+item.kind+'-proposal.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });return button;
  }
  function render(s){
    const lag=s.lastCycle?Date.now()-Date.parse(s.lastCycle):Infinity;
    text('serverPaperStatus',!s.configured?'Paused — the hosting operator must set an operator key before enabling.':!s.enabled?'Paused — no monitoring or new paper trades.':s.lastError?'Worker error — '+s.lastError:s.running?'Checking market data…':lag>300000?'Enabled — awaiting a recent successful cycle. Check the server.':s.session.regularOpen?'Enabled — checking US stocks every two minutes.':'Enabled — '+s.session.state+'; waiting for the next regular session.');
    text('serverPaperCash',usd(s.account.cash));text('serverPaperEquity',usd(s.equity));text('serverPaperScan',time(s.lastScan));text('serverPaperLearning',time(s.lastLearningAt));
    text('serverPaperWarning',(s.warnings||[]).join(' ')+' Connection checked '+time(new Date().toISOString())+'. Held prices may be stale; see each quote time.');
    node('serverPaperStart').disabled=!s.configured;node('serverPaperPause').disabled=!s.configured;
    rows('serverPaperHoldings',Object.values(s.account.open),[p=>p.symbol,p=>p.shares,p=>usd(p.entry),p=>usd(p.lastPrice),p=>time(p.lastPriceAsOf),p=>usd(p.stop)+' / '+usd(p.target)]);
    rows('serverPaperProposals',s.proposals.slice().reverse(),[p=>p.symbol+' / '+p.kind,p=>time(p.observedAt),p=>p.expired?'Expired':'Until '+time(p.expiresAt),p=>p.shares,p=>usd(p.referencePrice),p=>p.reason,details]);
    rows('serverPaperClosed',s.account.closed.slice(-30).reverse(),[p=>p.symbol,p=>time(p.exitTime),p=>usd(p.exit),p=>usd(p.pnl),p=>p.reason]);
  }
  async function request(path,options){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch(path,{...options,cache:'no-store',signal:controller.signal});const body=await response.json();if(!response.ok)throw new Error(body.error||'Server request failed');return body;}finally{clearTimeout(timer);}
  }
  async function refresh(){
    if(busy)return;busy=true;
    try{render(await request('/api/paper/status'));}catch(error){text('serverPaperStatus','Server unavailable — '+error.message+'. Previously shown values may be stale.');}finally{busy=false;}
  }
  async function control(enabled){
    const field=node('serverPaperToken');if(field.value){token=field.value;field.value='';}
    if(!token){text('serverPaperStatus','Enter the operator key to change the worker. It stays only in this page’s memory.');return;}
    try{render(await request('/api/paper/control',{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Token':token},body:JSON.stringify({enabled})}));if(enabled)setTimeout(refresh,1000);}catch(error){text('serverPaperStatus',error.message);}
  }
  function init(){
    if(location.protocol==='file:'){text('serverPaperStatus','Open the running app at http://127.0.0.1:10000 — a downloaded HTML file cannot connect to its server. Use Start Stock Learner.cmd in the project folder.');return;}
    node('serverPaperStart').addEventListener('click',()=>control(true));node('serverPaperPause').addEventListener('click',()=>control(false));node('serverPaperRefresh').addEventListener('click',refresh);
    refresh();setInterval(refresh,30000);window.addEventListener('pagehide',()=>{token='';});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
