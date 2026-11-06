const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadServer,loadBrowser}=require('./helpers.cjs');

test('damaged browser paper history is preserved and blocks trading',()=>{
  const {storage,run}=loadBrowser();
  storage.set('swingAccount','{broken');
  assert.throws(()=>run('getSwingAccount()'),/history|account|JSON/i);
  assert.equal(storage.get('swingAccount'),'{broken');
});

test('automatic swing exit cannot be overwritten by its earlier account snapshot',()=>{
  const {run}=loadBrowser();
  run(`var account=getSwingAccount();Object.assign(account,{starting:5000,cash:4500,open:{AAPL:{symbol:'AAPL',entry:10,shares:50,cost:500,stop:9.5,target:12,entryTime:new Date().toISOString()}},closed:[]});saveSwingAccount(account);
    RESULTS=[{symbol:'AAPL',price:9,quote:{price:9},score:30}]; usableQuote=()=>true;renderAccounts=()=>{};showPop=()=>{};showAlert=()=>{};speak=()=>{};addFeed=()=>{};
    shouldSwingExit=()=> 'Stop hit'; canSwingEnter=()=>false; autoSwingCheck();`);
  assert.equal(run('Object.keys(getSwingAccount().open).length'),0);
  assert.equal(run('getSwingAccount().closed.length'),1);
  assert.equal(run('getSwingAccount().cash'),4950);
});

test('US scanner rejects Australian, foreign and cryptocurrency ticker formats before fetching',async t=>{
  const {run}=loadServer(t);
  for(const symbol of ['BHP.AX','VOD.L','BTC-USD','^VIX'])await assert.rejects(run(`getBars(${JSON.stringify(symbol)})`),/US-listed|US stock/i);
});

test('US entry counts use New York trading date rather than the device date',()=>{
  const {run}=loadBrowser();
  assert.equal(run(`sameTradingDate('2026-11-06T01:00:00Z','2026-11-05T23:00:00Z')`),true);
});

const fixture=`
const fixtureBars=Array.from({length:235},(_,i)=>({date:new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),open:10,high:10.5,low:9.8,close:10,volume:100000}));
getBars=async()=>({bars:fixtureBars,source:'test feed'});
analyzeSymbol=(symbol,bars)=>({symbol,price:10,score:90,riskReward:2,distanceToBuyZonePct:0,stopLoss:9,target1:12,decision:bars.length===231?'ENTER_NOW':'WATCH'});
const fixtureParams=getBacktestParams({query:{slippageBps:0}});`;

test('US historical gap below stop fills at the lower open',async t=>{
  const {run}=loadServer(t);
  run(fixture+`fixtureBars[232]={...fixtureBars[232],open:8,high:8.5,low:7.8,close:8};`);
  const result=await run(`backtestSymbols(['AAPL'],fixtureParams)`);
  assert.equal(result.trades[0].exit,8);
});

test('US backtest does not mark tomorrow\'s entry on today\'s balance',async t=>{
  const {run}=loadServer(t);
  run(fixture+`fixtureBars[231]={...fixtureBars[231],open:9.8,high:10.5,low:9.5,close:9.8};`);
  const result=await run(`backtestSymbols(['AAPL'],fixtureParams)`);
  assert.equal(result.trades.length,1);
  assert.equal(result.equityCurve.find(p=>p.date===run('fixtureBars[230].date')).equity,5000);
});
