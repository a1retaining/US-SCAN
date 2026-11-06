const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadServer,loadBrowser}=require('./helpers.cjs');

test('reported daily granularity cannot hide monthly actual timestamps',async t=>{
  const {run}=loadServer(t);
  run(`var response={chart:{result:[{meta:{symbol:'AAPL',currency:'USD',exchangeTimezoneName:'America/New_York',instrumentType:'EQUITY',dataGranularity:'1d'},timestamp:Array.from({length:40},(_,i)=>Date.UTC(2020,i,3,15)/1000),indicators:{quote:[{open:Array(40).fill(10),high:Array(40).fill(11),low:Array(40).fill(9),close:Array(40).fill(10),volume:Array(40).fill(100000)}]}}]}};fetchText=async()=>JSON.stringify(response);`);
  await assert.rejects(run(`yahooChart('AAPL','max','1d')`),/cadence|daily|session|gap/i);
});

test('explicit provider granularity mismatch is rejected',async t=>{
  const {run}=loadServer(t);
  run(`fetchText=async()=>JSON.stringify({chart:{result:[{meta:{symbol:'AAPL',currency:'USD',exchangeTimezoneName:'America/New_York',instrumentType:'EQUITY',dataGranularity:'3mo'}}]}});`);
  await assert.rejects(run(`yahooChart('AAPL','max','1d')`),/granularity|interval/i);
});

test('a quote that destroys reward/risk cannot pass the earlier candle-price tier',()=>{
  const {run}=loadBrowser();
  run(`entryAllowed=()=>true;renderAccounts=()=>{};showPop=()=>{};showAlert=()=>{};speak=()=>{};addFeed=()=>{};
    var signal={symbol:'AAPL',decision:'ENTER_NOW',price:100,stop:99,target:102,score:90,rr:2,buyLow:99,buyHigh:100,quote:{price:101.5,asOf:new Date().toISOString()},execution:{averageVolume20:1000000},raw:{instrument:{listingVerified:true}}};
    var result=openPaperTrade('swing',signal);`);
  assert.equal(run('result.ok'),false);
  assert.equal(run('getSwingAccount().cash'),5000);
});

test('daily validation rejects duplicate sessions and holidays; incomplete daily bar stays out of features',()=>{
  const {assertCadence,completedDaily}=require('../lib/data-quality.cjs');
  assert.throws(()=>assertCadence([{date:'2026-11-05'},{date:'2026-11-05'}],'1d'),/duplicate/);
  assert.throws(()=>assertCadence([{date:'2026-11-26'}],'1d',new Date('2026-11-27T15:00:00Z')),/holiday/);
  const bars=[{date:'2026-11-05'},{date:'2026-11-06'}];
  assert.equal(completedDaily(bars,'2026-11-06T15:00:00Z').length,1);
  assert.equal(completedDaily(bars,'2026-11-06T21:16:00Z').length,2);
});

test('browser compare-and-save rejects an older account snapshot and keeps a recovery revision',()=>{
  const {run,storage}=loadBrowser();
  run(`var one=getSwingAccount(),two=getSwingAccount();one.cash=4999;saveSwingAccount(one);`);
  assert.throws(()=>run(`two.cash=4900;saveSwingAccount(two);`),/changed|refresh/i);
  run(`one.cash=4998;saveSwingAccount(one);`);
  assert.equal(JSON.parse(storage.get('swingAccount.backup')).cash,4999);
  assert.equal(JSON.parse(storage.get('swingAccount')).cash,4998);
});
