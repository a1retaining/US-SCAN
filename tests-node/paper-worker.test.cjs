const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createWorker}=require('../lib/paper-worker.cjs');
function setup(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'us-worker-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  let now='2026-11-06T15:00:00Z',calls=0,signals=[];
  const options={directory,adminToken:'a'.repeat(32),now:()=>now,scan:async()=>{calls++;return {signals,errors:[]};},evaluate:async()=>({}),entryTier:()=>true};
  const worker=createWorker(options);
  const signal=(symbol='AAPL',price=100)=>({symbol,decision:'ENTER_NOW',score:90,stopLoss:98,target1:106,quote:{price,asOf:now},instrument:{symbol,currency:'USD',type:'EQUITY',listingVerified:true},execution:{eligible:true,averageVolume20:1000000}});
  return {directory,worker,options,signal,setSignals:x=>signals=x,setNow:x=>now=x,calls:()=>calls};
}
test('server paper stays paused until authorized and has no broker execution surface',async t=>{
  const s=setup(t);s.setSignals([s.signal()]);await s.worker.tick();
  assert.equal(s.calls(),0);assert.equal(s.worker.status().account.cash,5000);
  assert.throws(()=>s.worker.control(true,'wrong'),/authorized/i);
  assert.equal(s.worker.status().simulatedOnly,true);
  assert.equal(s.worker.status().brokerConnected,false);
});
test('serial ticks prevent duplicate buys, obey marked cash and persist across restart',async t=>{
  const s=setup(t);s.setSignals([s.signal()]);s.worker.control(true,'a'.repeat(32));
  await Promise.all([s.worker.tick(),s.worker.tick()]);await s.worker.tick();
  const state=s.worker.status();assert.equal(Object.keys(state.account.open).length,1);
  assert.equal(state.account.open.AAPL.shares,9);
  assert.ok(state.account.cash>=0);assert.ok(state.account.open.AAPL.shares*(100.1-98*.999)<=50);
  assert.equal(createWorker(s.options).status().account.cash,state.account.cash);
  assert.equal(state.proposals[0].kind,'ENTRY');assert.equal(state.proposals[0].simulatedOnly,true);
});
test('stale quotes and closed sessions cannot fill; missing held quotes preserve positions',async t=>{
  const s=setup(t);s.worker.control(true,'a'.repeat(32));
  const stale=s.signal();stale.quote.asOf='2026-11-06T14:00:00Z';s.setSignals([stale]);await s.worker.tick();
  assert.equal(Object.keys(s.worker.status().account.open).length,0);
  s.setSignals([s.signal()]);await s.worker.tick();s.setSignals([]);await s.worker.tick();
  assert.ok(s.worker.status().account.open.AAPL);assert.match(s.worker.status().warnings.join(' '),/AAPL/);
  s.setNow('2026-11-07T15:00:00Z');const calls=s.calls();await s.worker.tick();assert.equal(s.calls(),calls);
});
test('a weakening held stock exits at an observed adverse quote and cannot rebuy the same day',async t=>{
  const s=setup(t);s.worker.control(true,'a'.repeat(32));s.setSignals([s.signal()]);await s.worker.tick();
  s.setNow('2026-11-06T15:02:00Z');const fallen=s.signal('AAPL',95);fallen.score=10;fallen.decision='WATCH';fallen.execution.eligible=false;
  s.setSignals([fallen]);await s.worker.tick();const a=s.worker.status().account;
  assert.equal(Object.keys(a.open).length,0);assert.equal(a.closed.length,1);assert.equal(a.closed[0].exit,95*.999);
  s.setSignals([s.signal()]);await s.worker.tick();assert.equal(Object.keys(s.worker.status().account.open).length,0);
});
test('pausing while a scan is pending prevents later fills',async t=>{
  const s=setup(t);let resolve;s.options.scan=()=>new Promise(r=>resolve=r);const w=createWorker(s.options);
  w.control(true,'a'.repeat(32));const tick=w.tick();await Promise.resolve();w.control(false,'a'.repeat(32));
  resolve({signals:[s.signal()],errors:[]});await tick;assert.equal(w.status().account.cash,5000);
});
test('corrupt stored paper history is retained and blocks changes',t=>{
  const s=setup(t);const filename=path.join(s.directory,'us-server-paper.json');fs.writeFileSync(filename,'broken');
  assert.throws(()=>s.worker.status(),/preserved|storage/i);
  assert.throws(()=>s.worker.control(true,'a'.repeat(32)),/preserved|storage/i);
  assert.equal(fs.readFileSync(filename,'utf8'),'broken');
});
test('daily entry capacity, price floor, instrument identity and liquidity remain enforced',async t=>{
  const s=setup(t);s.worker.control(true,'a'.repeat(32));
  const bad=s.signal('IBM');bad.instrument.currency='AUD';
  const illiquid=s.signal('CAT');illiquid.execution.averageVolume20=1;
  const cheap=s.signal('F',4);
  s.setSignals([bad,illiquid,cheap,...['AAPL','MSFT','NVDA','COST'].map(x=>s.signal(x))]);await s.worker.tick();
  assert.deepEqual(Object.keys(s.worker.status().account.open),['AAPL','MSFT','NVDA']);
  s.setSignals([s.signal('COST')]);await s.worker.tick();assert.equal(Object.keys(s.worker.status().account.open).length,3);
});
test('a slow scan crossing the market close creates no after-hours fills',async t=>{
  const s=setup(t);s.setNow('2026-11-06T20:59:00Z');let resolve;
  s.options.scan=()=>new Promise(r=>resolve=r);const w=createWorker(s.options);w.control(true,'a'.repeat(32));
  const tick=w.tick();await Promise.resolve();s.setNow('2026-11-06T21:01:00Z');resolve({signals:[s.signal()],errors:[]});await tick;
  assert.equal(Object.keys(w.status().account.open).length,0);
});
test('completed-session learning is evaluated once per date phase without changing rules',async t=>{
  const s=setup(t);let evaluations=0;s.options.evaluate=async()=>{evaluations++;return {errors:[]};};
  s.setNow('2026-11-06T22:00:00Z');const w=createWorker(s.options);w.control(true,'a'.repeat(32));
  await w.tick();await w.tick();assert.equal(evaluations,1);assert.equal(w.status().policy.version,'US-server-paper-v1');assert.equal(w.status().account.cash,5000);
});
test('the five-position cap survives multiple trading dates',async t=>{
  const s=setup(t);s.worker.control(true,'a'.repeat(32));
  s.setSignals(['AAPL','MSFT','NVDA'].map(x=>s.signal(x)));await s.worker.tick();
  s.setNow('2026-11-09T15:00:00Z');s.setSignals(['AAPL','MSFT','NVDA','COST','JPM','CAT'].map(x=>s.signal(x)));await s.worker.tick();
  assert.equal(Object.keys(s.worker.status().account.open).length,5);
  assert.ok(!s.worker.status().account.open.CAT);
});
