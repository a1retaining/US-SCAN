const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadBrowser,loadServer}=require('./helpers.cjs');
const session=require('../public/market-session.js');
const {parseDirectory}=require('../lib/us-directory.cjs');

test('US regular session handles winter/summer offsets, holidays, half days and coverage expiry',()=>{
  assert.equal(session.at('2026-07-01T13:30:00Z').regularOpen,true);
  assert.equal(session.at('2026-11-06T13:30:00Z').regularOpen,false);
  assert.equal(session.at('2026-11-06T14:30:00Z').regularOpen,true);
  assert.equal(session.at('2026-11-26T16:00:00Z').regularOpen,false);
  assert.equal(session.at('2026-11-27T17:59:00Z').regularOpen,true);
  assert.equal(session.at('2026-11-27T18:00:00Z').regularOpen,false);
  assert.equal(session.at('2028-01-01T15:00:00Z').regularOpen,false);
  assert.equal(session.at('2029-01-02T15:00:00Z').available,false);
});

test('directory parser excludes test issues and maps US share-class syntax',()=>{
  const rows=parseDirectory('ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\nBRK.B|Berkshire Common Stock|N|BRK.B|N|100|N|BRK.B\nTEST|Test Stock|N|TEST|N|100|Y|TEST\nFile Creation Time: 1106202603:02|||||||','other');
  assert.equal(rows.length,1);
  assert.equal(rows[0].symbol,'BRK-B');
});

test('browser refuses stale, future, wrong-interval and holiday paper quotes',()=>{
  const {run}=loadBrowser();
  run(`var row={quote:{price:100,asOf:'2026-11-06T14:59:00Z'},execution:{mode:'day'},raw:{instrument:{listingVerified:true}}};`);
  assert.equal(run(`usableQuote(row,'day','2026-11-06T15:00:00Z')`),true);
  assert.equal(run(`usableQuote(row,'day','2026-11-06T15:05:00Z')`),false);
  assert.equal(run(`usableQuote(row,'day','2026-11-06T14:58:00Z')`),false);
  run(`row.quote.asOf='2026-11-26T15:00:00Z'`);
  assert.equal(run(`usableQuote(row,'day','2026-11-26T15:01:00Z')`),false);
});

test('manual duplicate entry cannot debit cash or replace the existing position',()=>{
  const {run}=loadBrowser();
  run(`canSwingEnter=()=>true; renderAccounts=()=>{};showPop=()=>{};showAlert=()=>{};speak=()=>{};addFeed=()=>{};
    var row={symbol:'AAPL',price:100,quote:{price:100,asOf:new Date().toISOString()},stop:95,target:120,execution:{averageVolume20:1000000},raw:{instrument:{listingVerified:true}},score:90};
    var first=openPaperTrade('swing',row); var before=JSON.stringify(getSwingAccount()); var second=openPaperTrade('swing',row);`);
  assert.equal(run('first.ok'),true);
  assert.equal(run('second.ok'),false);
  assert.equal(run('JSON.stringify(getSwingAccount())===before'),true);
});

test('day exits use intraday quotes and remain monitored below display score cutoff',()=>{
  const {run}=loadBrowser();
  run(`var account=getDayAccount();Object.assign(account,{cash:24500,open:{AAPL:{symbol:'AAPL',entry:100,shares:5,cost:500,stop:95,target:110,entryTime:new Date().toISOString()}}});saveDayAccount(account);
    RESULTS=[{symbol:'AAPL',price:90,quote:{price:90}}]; DAY_RESULTS=[];
    DAY_MANAGEMENT_RESULTS=[{symbol:'AAPL',price:110,quote:{price:110},score:30}];
    usableQuote=()=>true;renderAccounts=()=>{};showPop=()=>{};showAlert=()=>{};speak=()=>{};addFeed=()=>{};
    shouldDayExit=()=> 'Day score breakdown';DAY_AUTO=false;autoDayCheck();`);
  assert.equal(run('getDayAccount().closed[0].exit'),110);
  assert.equal(run('getDayAccount().closed[0].pnl'),50);
  assert.equal(run('Object.keys(getDayAccount().open).length'),0);
});

test('structurally damaged JSON account history also fails closed',()=>{
  const {storage,run}=loadBrowser();
  storage.set('swingAccount',JSON.stringify({cash:null,starting:5000,open:{},closed:[]}));
  assert.throws(()=>run('getSwingAccount()'),/history/i);
});

test('daily observation remains immutable and uses only later completed New York sessions',async t=>{
  const {run}=loadServer(t);
  run(`recordObservations([{symbol:'AAPL',price:10,score:40,priceAsOf:'2026-11-05'}],'2026-11-06T15:00:00Z');
    recordObservations([{symbol:'AAPL',price:11,score:90,priceAsOf:'2026-11-06'}],'2026-11-06T16:00:00Z');
    getBars=async()=>({source:'test feed',interval:'1d',bars:['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13'].map(date=>({date,open:10,close:11}))});`);
  await run(`evaluateObservations('2026-11-14T16:00:00Z')`);
  assert.equal(run('observationStore.read().length'),1);
  assert.equal(run('observationStore.read()[0].score'),40);
  assert.equal(run(`observationStore.read()[0].outcomes['5'].entryDate`),'2026-11-09');
  assert.equal(run(`observationStore.read()[0].outcomes['5'].provenance.source`),'test feed');
  assert.equal(run(`observationStore.read()[0].outcomes['10']`),undefined);
});

test('server paper eligibility is US-verified, fresh, regular-session and stock-only',t=>{
  const {run}=loadServer(t);
  run(`var signal={price:100,score:90,priceAsOf:'2026-11-05'};
    var result={source:'test',interval:'1d',instrument:{listingVerified:true,type:'ETF'},quote:{price:100,asOf:'2026-11-06T14:59:00Z'},bars:Array.from({length:250},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),close:100,volume:10000000}))};
    attachExecutionPolicy(signal,result,'swing','2026-11-06T15:00:00Z');`);
  assert.equal(run('signal.execution.eligible'),false);
  assert.match(run('signal.execution.reasons.join()'),/ETF/);
});
