
"use strict";
const express=require("express"),path=require("path"),fs=require("fs");
const {DEFAULT_SYMBOLS,getBars,getIndexBars,collectSymbols}=require("./dataProvider");
const {evaluateBatch}=require("./decisionEngine");
const {runBacktest}=require("./backtester");
const {AutoScheduler}=require("./scheduler");
const paperTrader=require("./paperTrader");
const app=express(),PORT=process.env.PORT||10000,VERSION="9.0.0-platform-rebuild";
app.use(express.json());app.use((req,res,next)=>{res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");if(req.method==="OPTIONS")return res.sendStatus(204);next()});app.use(express.static(path.join(__dirname,"../public")));
const state={version:VERSION,symbols:DEFAULT_SYMBOLS,indexBars:{},barsBySymbol:{},signals:[],backtest:null,expectancyBySetup:{},lastAlerts:[],lastScan:null,lastDataUpdate:null,lastBacktest:null};
function report(name,data){const dir=path.join(__dirname,"../data/reports");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),JSON.stringify(data,null,2))}
async function autoDataUpdate(){state.indexBars=await getIndexBars();const c=await collectSymbols(state.symbols);state.barsBySymbol=c.barsBySymbol;state.lastDataUpdate=new Date().toISOString();report("data-status.json",{updatedAt:state.lastDataUpdate,symbols:Object.keys(state.barsBySymbol),errors:c.errors})}
async function autoBacktest(){if(!Object.keys(state.barsBySymbol).length)await autoDataUpdate();const r=runBacktest({symbols:state.symbols,barsBySymbol:state.barsBySymbol,indexBars:state.indexBars,options:{maxHold:10,riskDollars:100}});state.backtest=r;state.expectancyBySetup=r.expectancyBySetup||{};state.lastBacktest=new Date().toISOString();report("latest-backtest.json",r)}
async function autoScan(){if(!Object.keys(state.barsBySymbol).length)await autoDataUpdate();const sig=evaluateBatch({symbols:state.symbols,barsBySymbol:state.barsBySymbol,indexBars:state.indexBars,riskDollars:100,expectancyBySetup:state.expectancyBySetup}).filter(s=>s.score>=45).slice(0,50);state.signals=sig;state.lastScan=new Date().toISOString();const p=paperTrader.processSignals(sig,{maxOpen:5,riskPct:1,maxPositionPct:20});state.lastAlerts=p.alerts;report("latest-signals.json",{updatedAt:state.lastScan,signals:sig})}
const scheduler=new AutoScheduler();scheduler.add("Data Collector",30*60*1000,autoDataUpdate);scheduler.add("Backtest Engine",2*60*60*1000,autoBacktest);scheduler.add("Live Scanner",60*1000,autoScan);scheduler.start();
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"../public/index.html")));
app.get("/api/health",(req,res)=>res.json({ok:true,version:VERSION,status:"online",automated:true,time:new Date().toISOString()}));
app.get("/api/state",(req,res)=>{const account=paperTrader.load();res.json({ok:true,version:VERSION,status:scheduler.snapshot(),symbols:state.symbols,lastDataUpdate:state.lastDataUpdate,lastBacktest:state.lastBacktest,lastScan:state.lastScan,signals:state.signals,backtestSummary:state.backtest?state.backtest.summary:null,expectancyBySetup:state.expectancyBySetup,paperAccount:account,alerts:account.alerts.slice(0,20),newAlerts:state.lastAlerts})});
app.get("/api/scan",async(req,res)=>{await autoScan();res.json({ok:true,updatedAt:state.lastScan,signals:state.signals,alerts:state.lastAlerts})});
app.get("/api/bars",async(req,res)=>{try{const symbol=String(req.query.symbol||"SPY").toUpperCase();res.json({ok:true,symbol,bars:await getBars(symbol)})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get("/api/report/backtest",(req,res)=>res.json(state.backtest||{ok:false,error:"Backtest not ready yet"}));
app.listen(PORT,()=>console.log(`TradingMint PRO ${VERSION} running on ${PORT}`));
