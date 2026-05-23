
"use strict";
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const round=(v,d=2)=>{const x=n(v);return x===null?null:Number(x.toFixed(d))};
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
const pct=(a,b)=>{a=n(a);b=n(b);return a===null||b===null||b===0?0:((a-b)/b)*100};
const closes=bars=>Array.isArray(bars)?bars.map(b=>n(b.close)).filter(x=>x!==null):[];
const volumes=bars=>Array.isArray(bars)?bars.map(b=>n(b.volume)||0):[];
function sma(values,p){if(!Array.isArray(values)||values.length<p)return null;const s=values.slice(-p).map(n).filter(x=>x!==null);return s.length<p?null:s.reduce((a,b)=>a+b,0)/p}
function ema(values,p){if(!Array.isArray(values)||values.length<p)return null;const c=values.map(n).filter(x=>x!==null);if(c.length<p)return null;const k=2/(p+1);let cur=c.slice(0,p).reduce((a,b)=>a+b,0)/p;for(let i=p;i<c.length;i++)cur=c[i]*k+cur*(1-k);return cur}
function rsi(values,p=14){if(!Array.isArray(values)||values.length<=p)return null;const c=values.map(n);let g=0,l=0;for(let i=c.length-p;i<c.length;i++){if(c[i]===null||c[i-1]===null)return null;const d=c[i]-c[i-1];if(d>=0)g+=d;else l-=d}if(l===0)return 100;const rs=g/l;return 100-100/(1+rs)}
function atr(bars,p=14){if(!Array.isArray(bars)||bars.length<=p)return null;const tr=[];for(let i=1;i<bars.length;i++){const h=n(bars[i].high),l=n(bars[i].low),pc=n(bars[i-1].close);if(h===null||l===null||pc===null)continue;tr.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)))}return sma(tr,p)}
function high(bars,p){if(!Array.isArray(bars)||bars.length<p)return null;const v=bars.slice(-p).map(b=>n(b.high)).filter(x=>x!==null);return v.length?Math.max(...v):null}
function low(bars,p){if(!Array.isArray(bars)||bars.length<p)return null;const v=bars.slice(-p).map(b=>n(b.low)).filter(x=>x!==null);return v.length?Math.min(...v):null}
function moveOver(bars,lb){const c=closes(bars);return c.length<=lb?0:pct(c.at(-1),c[c.length-1-lb])}
module.exports={n,round,clamp,pct,closes,volumes,sma,ema,rsi,atr,high,low,moveOver};
