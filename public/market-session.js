(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.USMarketSession=api;})(typeof window==='object'?window:globalThis,function(){
  // Verified 6 Nov 2026: https://www.nyse.com/trade/hours-calendars
  // Regular-session research policy only; not an assertion about every venue.
  const holidays=new Set([
    '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
    '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
    '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'
  ]);
  const early=new Set(['2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function date(value){return formatter.format(new Date(value));}
  function covered(day){return Number(day.slice(0,4))>=2026&&Number(day.slice(0,4))<=2028;}
  function tradingDay(day){const weekday=new Date(day+'T12:00:00Z').getUTCDay();return covered(day)&&weekday!==0&&weekday!==6&&!holidays.has(day);}
  function instant(day,hour,minute){
    const noon=new Date(day+'T12:00:00Z');
    const parts=Object.fromEntries(clock.formatToParts(noon).map(p=>[p.type,p.value]));
    const offset=(Number(parts.hour)*60+Number(parts.minute))-720;
    return new Date(Date.parse(day+'T00:00:00Z')+(hour*60+minute-offset)*60000).toISOString();
  }
  function at(value=new Date()){
    const now=new Date(value),day=date(now),available=covered(day),open=instant(day,9,30),close=instant(day,early.has(day)?13:16,0);
    const regularOpen=tradingDay(day)&&now>=new Date(open)&&now<new Date(close);
    let nextOpen=null;
    for(let i=0;i<370;i++){
      const candidate=new Date(Date.parse(day+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);
      if(!covered(candidate))break;
      if(tradingDay(candidate)&&new Date(instant(candidate,9,30))>now){nextOpen=instant(candidate,9,30);break;}
    }
    return {sessionDate:day,timeZone:'America/New_York',calendarVersion:'NYSE-2026-2028-checked-20261106',available,
      regularOpen,scheduledOpen:tradingDay(day)?open:null,scheduledClose:tradingDay(day)?close:null,nextOpen,
      state:!available?'Calendar unavailable':!tradingDay(day)?'Closed':regularOpen?'Open':now<new Date(open)?'Pre-market':'After-hours',
      scope:'Regular-session model only. Extended hours and unscheduled halts/closures are not modelled.'};
  }
  return {at,date,tradingDay};
});
