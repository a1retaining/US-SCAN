(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StockPaperStorage=api;
})(typeof window==='object'?window:globalThis,function(){
  function validate(account){
    if(!account||typeof account!=='object'||!Number.isFinite(account.cash)||account.cash<0||
      !Number.isFinite(account.starting)||account.starting<=0||!account.open||Array.isArray(account.open)||
      typeof account.open!=='object'||!Array.isArray(account.closed))throw new Error('Invalid paper account history');
    for(const [symbol,position] of Object.entries(account.open)){
      if(!position||position.symbol!==symbol||!Number.isFinite(position.entry)||position.entry<=0||
        !Number.isInteger(position.shares)||position.shares<1||!Number.isFinite(position.cost)||position.cost<=0||
        !Number.isFinite(position.stop)||position.stop<=0||!Number.isFinite(position.target)||position.target<=0||
        !Number.isFinite(Date.parse(position.entryTime)))throw new Error('Invalid open position in paper history');
    }
    for(const trade of account.closed){
      if(!trade||typeof trade.symbol!=='string'||!Number.isFinite(trade.entry)||trade.entry<=0||
        !Number.isFinite(trade.exit)||trade.exit<=0||!Number.isInteger(trade.shares)||trade.shares<1||
        !Number.isFinite(trade.pnl)||!Number.isFinite(trade.cost)||trade.cost<=0||
        !Number.isFinite(trade.proceeds)||trade.proceeds<0||!Number.isFinite(Date.parse(trade.entryTime))||
        !Number.isFinite(Date.parse(trade.exitTime)))throw new Error('Invalid closed trade in paper history');
    }
    return account;
  }
  function create(storage){
    const revisions=new WeakMap();
    function read(key,size,legacyKey){
      let primary=storage.getItem(key),raw=primary;
      if(raw===null&&legacyKey)raw=storage.getItem(legacyKey);
      if(raw===null){
        if(storage.getItem(key+'.backup')!==null)throw new Error('Paper history is missing but a recovery backup exists. Restore it before trading.');
        const account={starting:size,cash:size,open:{},closed:[],createdAt:new Date().toISOString()};
        revisions.set(account,primary);return account;
      }
      try{
        const account=validate(JSON.parse(raw));
        revisions.set(account,primary);return account;
      }catch(error){throw new Error('Paper account history cannot be read. Original data is preserved. Export the raw backup before recovery. '+error.message);}
    }
    function save(key,account){
      validate(account);
      const current=storage.getItem(key);
      if(!revisions.has(account))throw new Error('Read the current paper account before saving a replacement');
      if(current!==revisions.get(account))throw new Error('Paper history changed in another update. Refresh before trading; no data was overwritten.');
      const next=JSON.stringify(account);
      if(next===current)return;
      if(current!==null){validate(JSON.parse(current));storage.setItem(key+'.backup',current);}
      storage.setItem(key,next);
      revisions.set(account,next);
    }
    return {read,save};
  }
  return {create,validate};
});

if(typeof window==='object'&&window.StockPaperStorage){
  window.US_PAPER_OWNER=false;
  if(navigator.locks&&navigator.locks.request){
    navigator.locks.request('stock-learner-us-paper-history',{ifAvailable:true},async function(lock){
      if(!lock){window.dispatchEvent(new Event('paperownershipchange'));return;}
      window.US_PAPER_OWNER=true;
      window.dispatchEvent(new Event('paperownershipchange'));
      await new Promise(resolve=>window.addEventListener('pagehide',resolve,{once:true}));
      window.US_PAPER_OWNER=false;
    }).catch(function(){window.US_PAPER_OWNER=false;window.dispatchEvent(new Event('paperownershipchange'));});
  }
}
