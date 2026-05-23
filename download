
"use strict";
function calculatePositionSize({equity=5000,riskPct=1,entry,stop,maxPositionPct=20}){const e=Number(equity),ep=Number(entry),sp=Number(stop);if(!Number.isFinite(e)||!Number.isFinite(ep)||!Number.isFinite(sp)||ep<=0||ep<=sp)return{shares:0,riskDollars:0,positionValue:0,reason:"Invalid risk inputs"};const maxRisk=e*(Number(riskPct)/100),riskPerShare=ep-sp,raw=Math.floor(maxRisk/riskPerShare),maxShares=Math.floor((e*(Number(maxPositionPct)/100))/ep),shares=Math.max(0,Math.min(raw,maxShares));return{shares,riskDollars:Number((shares*riskPerShare).toFixed(2)),positionValue:Number((shares*ep).toFixed(2)),maxRiskAllowed:Number(maxRisk.toFixed(2)),riskPerShare:Number(riskPerShare.toFixed(2))}}
module.exports={calculatePositionSize};
