// Synthetic upgrade/lifecycle checks. No user photos, installed-app claims or model downloads.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit,devices}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const html=await readFile('index.html','utf8'),current=html.match(/name="oc-build" content="([a-f0-9]{12})"/)[1],next=current==='abcdef012345'?'012345abcdef':'abcdef012345';
const base='http://127.0.0.1:4173/Oc/';
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});
const reports=[];
async function resume(page){
 await page.evaluate(()=>{
  const now=performance.now.bind(performance);
  Object.defineProperty(performance,'now',{configurable:true,value:()=>now()+31000});
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  document.dispatchEvent(new Event('visibilitychange'));
 });
}
async function fixture(browser,options,{available=false,stale=false,failSave=false}={}){
 const context=await browser.newContext(options),page=await context.newPage(),errors=[],requests=[];
 let published=available,checks=0;
 page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>requests.push(request.url()));
 if(failSave)await page.addInitScript(()=>{
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(value,key){
   if(this.name==='state'&&key==='draft'&&window.failDraft)throw new DOMException('Injected quota failure','QuotaExceededError');
   return put.apply(this,arguments);
  };
 });
 await context.route('**/Oc/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/Oc/'||url.pathname==='/Oc/index.html'){
   if(!request.isNavigationRequest())checks++;
   const fresh=published&&(!request.isNavigationRequest()||(!stale&&url.searchParams.get('oc-build')===next));
   await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fresh?html.replaceAll(current,next):html});return;
  }
  await route.continue();
 });
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#review-count')?.textContent);
 return {page,context,errors,requests,publish:()=>{published=true;},checks:()=>checks};
}
try{
for(const [name,engine,options] of [['chromium',chromium,{viewport:{width:390,height:844}}],['webkit',webkit,{...devices['iPhone 14'],locale:'zh-TW'}]].filter(([name])=>!process.env.OC_BROWSER||name===process.env.OC_BROWSER)){
 const browser=await engine.launch();
 try{
  // Automatic cold start installs only the new UI, once, without fetching models.
  let f=await fixture(browser,options,{available:true});
  await f.page.waitForURL('**/?oc-build='+next);await f.page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('最新版'));
  assert.equal(await f.page.locator('#app-build').textContent(),next);
  assert.ok(!f.requests.some(url=>/\/models\/|\/vendor\/|worker\.js/.test(url)));
  assert.deepEqual(f.errors,[]);await f.context.close();

  f=await fixture(browser,options);
  const p=f.page;await p.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('最新版'));
  await p.evaluate(async()=>{
   const store=await import('./src/store.js'),model=await import('./src/model-cache.js');
   await store.setState('template',{schema:1,roi:{x:0,y:0,w:1,h:1}});
   await store.saveSample({id:'upgrade-sample',schema:1,time:'0900'});
   await model.writeModelFile(new URL('models/upgrade-check',location.href).href,new Uint8Array([1,2,3]).buffer);
   localStorage.setItem('strforge.state.v2','KEEP-STRFORGE');
  });
  await p.locator('[data-tab=review]').click();await p.locator('#add-row').click();
  await p.locator('.row-edit input').fill('0912');await p.locator('.confirm-row').click();
  await p.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
  f.publish();const checks=f.checks();await resume(p);
  await p.waitForSelector('#update-banner:not([hidden])');
  assert.equal(new URL(p.url()).searchParams.has('oc-build'),false,'Existing work is not automatically reloaded');
  assert.equal(f.checks(),checks+1,'pageshow and visibility events share one check');
  p.once('dialog',dialog=>dialog.accept());await p.locator('#apply-update-banner').click();
  await p.waitForURL('**/?oc-build='+next);await p.locator('[data-tab=review]').click();
  await p.waitForFunction(()=>document.querySelectorAll('.row').length===1);
  assert.equal(await p.locator('.row-edit input').inputValue(),'0912');
  assert.match(await p.locator('#review-count').textContent(),/已確認 1/);
  const data=await p.evaluate(async()=>{
   const store=await import('./src/store.js'),model=await import('./src/model-cache.js');
   return {template:await store.getState('template'),samples:(await store.allSamples()).length,model:[...new Uint8Array(await model.readModelFile(new URL('models/upgrade-check',location.href).href))],strforge:localStorage.getItem('strforge.state.v2')};
  });
  assert.equal(data.template.schema,1);assert.equal(data.samples,1);assert.deepEqual(data.model,[1,2,3]);assert.equal(data.strforge,'KEEP-STRFORGE');
  await p.locator('[data-tab=settings]').click();await f.context.unroute('**/Oc/**');await f.context.setOffline(true);await p.locator('#check-update').click();
  await p.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('暫時無法'));
  assert.equal(await p.locator('#app-build').textContent(),next);await f.context.setOffline(false);
  await p.screenshot({path:'test-report/'+name+'-update.png',fullPage:true});
  assert.deepEqual(f.errors,[]);await f.context.close();

  // A stale CDN navigation must stop after one automatic replacement.
  f=await fixture(browser,options,{available:true,stale:true});
  await f.page.waitForURL('**/?oc-build='+next);
  await f.page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('不會反覆'));
  assert.equal(f.checks(),2);assert.deepEqual(f.errors,[]);await f.context.close();

  // Failed persistence prevents navigation even after a user requests an update.
  f=await fixture(browser,options,{failSave:true});
  await f.page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('最新版'));
  await f.page.evaluate(()=>{window.failDraft=true;});
  await f.page.locator('[data-tab=review]').click();await f.page.locator('#add-row').click();await f.page.locator('.row-edit input').fill('1003');
  await f.page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('保存失敗'));
  f.publish();await f.page.locator('[data-tab=settings]').click();await f.page.locator('#check-update').click();
  await f.page.waitForSelector('#apply-update:not([hidden])');
  f.page.once('dialog',dialog=>dialog.accept());await f.page.locator('#apply-update').click();
  await f.page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('草稿保存失敗'));
  assert.equal(new URL(f.page.url()).searchParams.has('oc-build'),false);
  assert.equal(await f.page.locator('main').evaluate(el=>el.inert),false);
  assert.deepEqual(f.errors,[]);await f.context.close();

  // A pending photo load is an active operation. Loaded photos need manual consent.
  f=await fixture(browser,options);await f.page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('最新版'));
  let held,received;const waiting=new Promise(resolve=>received=resolve);
  await f.context.route('**/assets/demo-times.png',route=>{held=route;received();});
  await f.page.locator('#demo').click();await waiting;
  f.publish();await f.page.locator('[data-tab=settings]').click();await f.page.locator('#check-update').click();
  await f.page.waitForSelector('#apply-update:not([hidden])');await f.page.locator('#apply-update').click();
  assert.match(await f.page.locator('#update-status').textContent(),/請等目前操作/);
  await held.continue();await f.page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('MNIST'));
  f.page.once('dialog',dialog=>dialog.dismiss());await f.page.locator('#apply-update').click();
  assert.equal(new URL(f.page.url()).searchParams.has('oc-build'),false);
  assert.deepEqual(f.errors,[]);await f.context.close();

  // Unknown draft schemas remain intact and block automatic/manual replacement.
  f=await fixture(browser,options);
  await f.page.evaluate(async()=>{const store=await import('./src/store.js');await store.setState('draft',{schema:99,keep:'unknown'});});
  await f.page.reload();await f.page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('無法還原'));
  f.publish();await f.page.locator('[data-tab=settings]').click();await f.page.locator('#check-update').click();
  await f.page.waitForSelector('#apply-update:not([hidden])');f.page.once('dialog',dialog=>dialog.accept());await f.page.locator('#apply-update').click();
  await f.page.waitForFunction(()=>document.querySelector('#update-status').textContent.includes('儲存不可用'));
  assert.deepEqual(await f.page.evaluate(async()=>{const store=await import('./src/store.js');return store.getState('draft');}),{schema:99,keep:'unknown'});
  assert.deepEqual(f.errors,[]);await f.context.close();
  reports.push({browser:name,automaticStart:true,resume:true,manualUpdate:true,draftPreserved:true,storageSentinelsPreserved:true,offline:true,loopGuard:true,saveFailure:true,busyGuard:true,photoConsent:true,unknownSchema:true,noModelPreload:true});
 }finally{await browser.close();}
}
console.log('UPDATE_RESULT '+JSON.stringify(reports));
await writeFile('test-report/update.json',JSON.stringify(reports,null,2));
}finally{server.kill();}
