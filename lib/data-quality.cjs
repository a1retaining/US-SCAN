const session=require('../public/market-session.js');
function assertCadence(bars,interval,reference=new Date()){
  if(!Array.isArray(bars)||!bars.length)throw new Error('No market bars');
  const today=session.date(reference);
  let previous=null,maxGap=0;
  for(const bar of bars){
    const time=Date.parse(bar.date);
    if(!Number.isFinite(time)||bar.date.slice(0,10)>today)throw new Error('Market series has an invalid or future session date');
    if(previous!==null&&time<=previous)throw new Error('Market series has duplicate or unordered session dates');
    if(interval==='1d'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(bar.date)||new Date(time).toISOString().slice(0,10)!==bar.date)throw new Error('Invalid daily session date');
      const day=new Date(time).getUTCDay();
      if(day===0||day===6)throw new Error('Daily data contains a non-session weekend');
      if(Number(bar.date.slice(0,4))>=2026&&Number(bar.date.slice(0,4))<=2028&&!session.tradingDay(bar.date))throw new Error('Daily data contains an exchange holiday session');
      if(previous!==null)maxGap=Math.max(maxGap,(time-previous)/86400000);
    }
    previous=time;
  }
  if(interval==='1d'){
    const first=Date.parse(bars[0].date),last=Date.parse(bars.at(-1).date);
    const expectedWeekdays=((last-first)/86400000+1)*5/7;
    if(maxGap>7||(bars.length>=35&&bars.length/expectedWeekdays<0.85))throw new Error('Daily data cadence is sparse or has a missing-session gap; cannot treat these bars as daily trading sessions');
  }
  return true;
}
function completedDaily(bars,reference=new Date()){
  const now=new Date(reference),status=session.at(now);
  const closeKnown=status.available&&status.scheduledClose&&now.getTime()>=Date.parse(status.scheduledClose)+15*60000;
  return bars.filter(bar=>bar.date<status.sessionDate||(bar.date===status.sessionDate&&closeKnown));
}
module.exports={assertCadence,completedDaily};
