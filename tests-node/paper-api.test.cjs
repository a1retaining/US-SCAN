const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadServer}=require('./helpers.cjs');
test('paper API requires a configured operator token and exports only the separate simulation',async t=>{
  const {run}=loadServer(t,{PAPER_ADMIN_TOKEN:'operator-only-token-123456789'});
  const server=run("app.listen(0,'127.0.0.1')");t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const status=await fetch(url+'/api/paper/status');assert.equal(status.status,200);
  assert.equal((await status.json()).enabled,false);
  const denied=await fetch(url+'/api/paper/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true})});
  assert.equal(denied.status,403);
  const invalid=await fetch(url+'/api/paper/control',{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Token':'operator-only-token-123456789'},body:JSON.stringify({enabled:'false'})});
  assert.equal(invalid.status,400);
  const allowed=await fetch(url+'/api/paper/control',{method:'POST',headers:{'Content-Type':'application/json','X-Paper-Token':'operator-only-token-123456789'},body:JSON.stringify({enabled:true})});
  assert.equal(allowed.status,200);assert.equal((await allowed.json()).enabled,true);
  const exported=await (await fetch(url+'/api/paper/export')).json();assert.equal(exported.state.account.cash,5000);assert.equal(exported.simulatedOnly,true);
  assert.ok(!JSON.stringify(exported).includes('operator-only-token'));
});
