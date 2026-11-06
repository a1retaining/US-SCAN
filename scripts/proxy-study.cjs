// Reproducible engineering study, not a profitable-strategy search.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2]||path.join(root,'.local-data/research'));
fs.mkdirSync(output,{recursive:true});
const context=vm.createContext({require:createRequire(path.join(root,'src/server.js')),__dirname:path.join(root,'src'),
  process:{env:{STOCK_DATA_DIR:path.join(root,'.local-data')},uptime:()=>0},fetch,console,Buffer,URL,AbortController,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(path.join(root,'src/server.js'),'utf8').replace(/app\.listen\(PORT,[\s\S]*$/,''),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
  const symbols=['AAPL','MSFT','NVDA','JPM','COST']; // fixed engineering sample, not stock recommendations
  const data={},errors=[];
  for(const symbol of [...symbols,'SPY']){
    try{data[symbol]=await run(`getBars('${symbol}','max','1d')`);console.log(symbol+': '+data[symbol].bars.length+' bars, '+data[symbol].source);}
    catch(error){errors.push({symbol,error:error.message});console.log(symbol+': unavailable');}
  }
  const snapshot=JSON.stringify(data);
  const hash=createHash('sha256').update(snapshot).digest('hex');
  const snapshotFile=path.join(output,'market-snapshot-'+hash+'.json');
  if(!fs.existsSync(snapshotFile))fs.writeFileSync(snapshotFile,snapshot,{flag:'wx'});
  context.studyData=data;
  run(`getBars=async symbol=>{if(!studyData[symbol])throw new Error('Source unavailable');return studyData[symbol];};`);
  const scenarios=[];
  for(const bps of [0,10,25,50]){
    const result=await run(`backtestSymbols(${JSON.stringify(symbols)},getBacktestParams({query:{years:10,slippageBps:${bps},entryBrokerFee:0,exitBrokerFee:0}}))`);
    const curve=result.equityCurve,first=curve[0]?.date,last=curve.at(-1)?.date;
    const spy=(data.SPY?.bars||[]).filter(bar=>bar.date>=first&&bar.date<=last);
    const slip=bps/10000;
    const shares=spy.length?Math.floor(5000/(spy[0].close*(1+slip))):0;
    const committed=spy.length?shares*spy[0].close*(1+slip):0;
    const benchmarkEnding=spy.length?5000-committed+shares*spy.at(-1).close*(1-slip):null;
    const tradeCount=result.stats.totalTrades;
    const entered=new Set(result.trades.map(trade=>trade.symbol));
    const averageGrossExposurePct=curve.length?curve.reduce((sum,point)=>sum+(point.grossExposurePct||0),0)/curve.length:null;
    scenarios.push({slippageBpsPerSide:bps,commissionPerSide:0,firstDate:first,lastDate:last,averageGrossExposurePct,stats:result.stats,
      loaded:result.loaded,errors:result.errors,perSymbol:result.perSymbol,
      // Full results are retained for independent audit; the API truncates displayed trades.
      displayedTrades:result.trades,displayedTradeLimit:250,
      benchmark:{name:'SPY price-only buy-and-hold, whole shares at first aligned close; dividends excluded',endingEquity:benchmarkEnding,netReturnPct:benchmarkEnding===null?null:(benchmarkEnding/5000-1)*100},
      checks:{tradeCount,displayedSymbols:[...entered],isLivePolicyValidation:false}});
  }
  const report={createdAt:new Date().toISOString(),study:'US engineering proxy cost sensitivity v1',
    universe:symbols,universeSelection:'Fixed present-day engineering examples, survivor-selected; not security recommendations or point-in-time universe',
    snapshotSha256:hash,snapshotFile:path.basename(snapshotFile),sources:Object.fromEntries(Object.entries(data).map(([symbol,result])=>[symbol,{source:result.source,instrument:result.instrument,firstDate:result.bars[0]?.date,lastDate:result.bars.at(-1)?.date,bars:result.bars.length}])),
    scenarios,errors,limitations:['Historical daily-bar proxy, not validation of browser trading rules.','Public source adjustments, dividends, earnings, halts, delistings and historical universe membership unverified.','SPY comparison is price-only and illustrative, not a total-return benchmark.','Four prespecified cost scenarios; no winner is selected and no parameters are applied.']};
  fs.writeFileSync(path.join(output,'us-proxy-cost-study.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(scenarios.map(item=>({bps:item.slippageBpsPerSide,trades:item.stats.totalTrades,returnPct:item.stats.netReturnPct,drawdownPct:item.stats.maxDrawdownPct,spyPriceReturnPct:item.benchmark.netReturnPct}))));
})().catch(error=>{console.error(error);process.exitCode=1;});
