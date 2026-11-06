const path=require('node:path');
const crypto=require('node:crypto');
const {createArrayStore}=require('./array-store.cjs');
const session=require('../public/market-session.js');
const {validate:validateAccount}=require('../public/paper-storage.js');
const POLICY=Object.freeze({version:'US-server-paper-v1',starting:5000,riskDollars:50,maxPositionPct:20,maxOpen:5,maxEntriesPerDay:3,slippageBps:10,commission:0,pollMs:120000});
function validState(rows){
  if(rows.length!==1)return false;
  const s=rows[0];
  try{validateAccount(s.account);}catch{return false;}
  if(Object.values(s.account.open).some(p=>!Number.isFinite(p.lastPrice)||p.lastPrice<=0||!Number.isFinite(Date.parse(p.lastPriceAsOf))))return false;
  return s.version===POLICY.version&&typeof s.enabled==='boolean'&&Number.isInteger(s.epoch)&&s.epoch>=0&&
    Array.isArray(s.proposals)&&Array.isArray(s.warnings)&&s.proposals.every(p=>p&&typeof p.id==='string'&&p.simulatedOnly===true&&Number.isFinite(Date.parse(p.expiresAt)));
}
function authorized(expected,supplied){
  if(typeof expected!=='string'||expected.length<24||typeof supplied!=='string')return false;
  const a=crypto.createHash('sha256').update(expected).digest(),b=crypto.createHash('sha256').update(supplied).digest();
  return crypto.timingSafeEqual(a,b);
}
function createWorker({directory,adminToken='',scan,evaluate,entryTier,now=()=>new Date().toISOString()}){
  const configured=typeof adminToken==='string'&&adminToken.length>=24;
  const store=createArrayStore(path.join(directory,'us-server-paper.json'),validState);
  let busy=null,timer=null,lastError=null;
  function initial(){return {version:POLICY.version,enabled:false,epoch:0,createdAt:now(),account:{starting:5000,cash:5000,open:{},closed:[],createdAt:now()},proposals:[],warnings:[],lastCycle:null,lastScan:null,lastLearningKey:null};}
  function read(){const rows=store.read();return rows.length?rows[0]:initial();}
  function transact(fn){return store.update(rows=>{if(!rows.length)rows.push(initial());return fn(rows[0]);});}
  function quoteUsable(signal,at){
    const q=signal?.quote,i=signal?.instrument,age=Date.parse(at)-Date.parse(q?.asOf);
    return !!q&&Number.isFinite(q.price)&&q.price>0&&age>=0&&age<=300000&&session.date(q.asOf)===session.date(at)&&
      /^[A-Z]{1,6}(?:-[A-Z])?$/.test(signal.symbol)&&i?.listingVerified===true&&i.symbol===signal.symbol&&i.currency==='USD'&&i.type==='EQUITY';
  }
  function equity(account){return account.cash+Object.values(account.open).reduce((sum,p)=>sum+p.shares*p.lastPrice,0);}
  function status(){
    const s=read(),at=now();
    return {...s,enabled:s.enabled&&configured,configured,running:!!busy,lastError,policy:POLICY,simulatedOnly:true,brokerConnected:false,
      session:session.at(at),equity:equity(s.account),proposals:s.proposals.slice(-100).map(p=>({...p,expired:Date.parse(p.expiresAt)<Date.parse(at)})),
      notes:['Separate server simulation; existing browser accounts are unchanged.','Quote polling misses prices between checks; stops and targets are not guaranteed fills.','No broker connection. Proposals must be independently reviewed; no orders are submitted.','Rules are fixed. Learning reports do not automatically change them.','Server uptime, persistent disk and one application instance are required.']};
  }
  function control(enabled,token){
    if(!authorized(adminToken,token))throw new Error('Not authorized to change the paper worker');
    if(typeof enabled!=='boolean')throw new Error('enabled must be true or false');
    transact(s=>{s.enabled=enabled;s.epoch++;});return status();
  }
  function proposal(s,signal,kind,at,details){
    const id=[session.date(at),signal.symbol,kind].join(':');
    const item={id,kind,symbol:signal.symbol,observedAt:at,quoteAsOf:signal.quote.asOf,expiresAt:new Date(Date.parse(signal.quote.asOf)+300000).toISOString(),simulatedOnly:true,score:signal.score,...details};
    const prior=s.proposals.findIndex(p=>p.id===id);
    // Retain first-seen proposal as evidence; each paper fill records its own quote.
    if(prior===-1)s.proposals.push(item);
  }
  async function cycle(){
    const start=read();if(!configured||!start.enabled)return status();
    const at=now(),market=session.at(at);
    if(!market.regularOpen){
      const learningKey=market.sessionDate+(market.scheduledClose&&Date.parse(at)>Date.parse(market.scheduledClose)+900000?':closed':':prior');
      if(start.lastLearningKey!==learningKey&&evaluate){
        const report=await evaluate(at);
        if(report.errors?.length)throw new Error('Learning data incomplete: '+report.errors.map(e=>e.symbol+': '+e.error).join('; '));
        transact(s=>{s.lastLearningKey=learningKey;s.lastLearningAt=now();});
      }
      transact(s=>{s.lastCycle=now();s.warnings=[market.state+': waiting for the next regular session.'];});return status();
    }
    const result=await scan(Object.keys(start.account.open));
    const finished=now();
    // A slow request crossing the close cannot create an after-hours fill.
    if(!session.at(finished).regularOpen)return status();
    transact(s=>{
      if(!s.enabled||s.epoch!==start.epoch)return;
      const signals=result.signals||[],bySymbol=new Map(signals.map(signal=>[signal.symbol,signal]));
      const day=session.date(finished),a=s.account;
      s.warnings=(result.errors||[]).map(e=>e.symbol+': '+e.error);s.lastCycle=finished;s.lastScan=finished;
      for(const [symbol,p] of Object.entries(a.open)){
        const signal=bySymbol.get(symbol);
        if(!quoteUsable(signal,finished)){s.warnings.push(symbol+': missing or stale US quote; holding retained.');continue;}
        if(Date.parse(signal.quote.asOf)<Date.parse(p.lastPriceAsOf)){s.warnings.push(symbol+': older quote ignored.');continue;}
        p.lastPrice=signal.quote.price;p.lastPriceAsOf=signal.quote.asOf;
        const reason=p.lastPrice<=p.stop?'Observed stop':p.lastPrice>=p.target?'Observed target':Date.parse(finished)-Date.parse(p.entryTime)>=86400000&&signal.score<55?'Weak score after 24 hours':null;
        if(!reason)continue;
        const exit=p.lastPrice*.999,proceeds=p.shares*exit;
        proposal(s,signal,'EXIT',finished,{reason,shares:p.shares,referencePrice:p.lastPrice});
        a.cash+=proceeds;a.closed.push({...p,exit,exitTime:finished,exitQuote:signal.quote,proceeds,pnl:proceeds-p.cost,reason});delete a.open[symbol];
      }
      const allTrades=[...a.closed,...Object.values(a.open)],todayEntries=allTrades.filter(p=>session.date(p.entryTime)===day);
      let entries=todayEntries.length;
      for(const signal of signals){
        if(a.open[signal.symbol]||entries>=3||Object.keys(a.open).length>=5)continue;
        if(todayEntries.some(p=>p.symbol===signal.symbol)||!quoteUsable(signal,finished)||signal.execution?.eligible!==true||signal.decision!=='ENTER_NOW'||signal.quote.price<5)continue;
        const entry=signal.quote.price*1.001,stop=signal.stopLoss,target=signal.target1;
        if(!Number.isFinite(stop)||!Number.isFinite(target)||stop<=0||stop>=signal.quote.price||target<=entry)continue;
        const riskPerShare=entry-stop*.999,rr=(target*.999-entry)/riskPerShare;
        if(!Number.isFinite(rr)||rr<1.3||!entryTier({...signal,price:entry,riskReward:rr}))continue;
        const shares=Math.floor(Math.min(50/riskPerShare,equity(a)*.2/entry,a.cash/entry));
        const volume=signal.execution.averageVolume20;
        if(shares<1||!Number.isFinite(volume)||volume<=0||shares>volume*.01)continue;
        const details={shares,referencePrice:signal.quote.price,simulatedEntry:entry,stop,target,rewardRisk:rr,reason:'Fixed US swing research rules passed; review events, data and broker details independently.'};
        proposal(s,signal,'ENTRY',finished,details);
        a.open[signal.symbol]={symbol:signal.symbol,entry,shares,cost:shares*entry,stop,target,entryTime:finished,entryQuote:signal.quote,lastPrice:signal.quote.price,lastPriceAsOf:signal.quote.asOf,executionModel:POLICY.version};
        a.cash-=shares*entry;entries++;
      }
    });
    return status();
  }
  function tick(){
    if(busy)return busy;
    busy=Promise.resolve().then(cycle).then(result=>{lastError=null;return result;}).catch(error=>{lastError=error.message;throw error;}).finally(()=>{busy=null;});return busy;
  }
  function start(){
    if(timer||!configured)return;
    const timers=require('node:timers');
    const run=()=>tick().catch(error=>console.error('US paper worker: '+error.message));
    timer=timers.setInterval(run,POLICY.pollMs);timer.unref();run();
  }
  function stop(){if(timer)require('node:timers').clearInterval(timer);timer=null;}
  return {status,control,tick,start,stop,export:()=>({exportedAt:now(),simulatedOnly:true,policy:POLICY,state:read()})};
}
module.exports={createWorker,authorized,POLICY};
