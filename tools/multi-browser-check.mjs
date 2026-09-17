import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';import{spawn}from'node:child_process';import{pathToFileURL}from'node:url';
const {chromium,webkit,devices}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});const reports=[];const base='http://127.0.0.1:4173/Oc/';
const readRows=page=>page.locator('.row-edit input').evaluateAll(items=>items.map(x=>x.value));
try{
for(const[name,engine,options]of[['chromium',chromium,{viewport:{width:390,height:844}}],['webkit',webkit,{...devices['iPhone 14'],locale:'zh-TW'}]]){
 const browser=await engine.launch();const context=await browser.newContext(options),page=await context.newPage(),requests=[],errors=[];
 try{
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(String(e)));
  context.on('request',r=>requests.push({url:r.url(),method:r.method(),post:r.postData()}));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('還沒有'));
  assert.equal(requests.some(r=>/\/models\/|\/vendor\/|line-worker|ocr-worker/.test(r.url)),false,'No engine or weights at homepage startup');
  await page.evaluate(()=>localStorage.setItem('strforge.state.v2','KEEP'));
  for(const id of ['ppocr-v5-en','ppocr-v5-ch','ppocr-v4-en'])await page.locator(`input[name=engine][value="${id}"]`).check();
  await page.locator('#demo').click();await page.waitForSelector('#photo-editor:not([hidden])');
  await page.locator('#recognize').click();await page.waitForSelector('#review:not([hidden])',{timeout:240000});
  await page.waitForFunction(()=>document.querySelectorAll('.result-tab').length===4);
  assert.equal(await page.locator('.result-tab:disabled').count(),0,'Each engine must actually finish');
  const raw={};for(const id of ['cnn','ppocr-v5-en','ppocr-v5-ch','ppocr-v4-en']){await page.locator(`.result-tab[data-engine="${id}"]`).click();raw[id]=await readRows(page);assert.equal(raw[id].length,4);assert.ok(raw[id].some(Boolean),'Real inference must produce text');}
  await page.locator('.result-tab[data-engine="cnn"]').click();assert.deepEqual(await readRows(page),['0900','0910','1002','1004']);
  await page.locator('.row-edit input').first().fill('0905');await page.locator('#confirm-valid').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
  await page.locator('.result-tab[data-engine="ppocr-v5-en"]').click();assert.deepEqual(await readRows(page),raw['ppocr-v5-en']);
  // A different model receives different corrections, not the CNN's corrections.
  for(let i=0;i<4;i++)await page.locator('.row-edit input').nth(i).fill(['0910','0911','0912','0913'][i]);
  await page.locator('#confirm-valid').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
  await page.locator('#txt').click();assert.equal(await page.locator('#output').inputValue(),'09:10\n09:11\n09:12\n09:13\n');
  await page.locator('.result-tab[data-engine="cnn"]').click();assert.equal((await readRows(page))[0],'0905');
  await page.locator('#csv').click();assert.match(await page.locator('#output').inputValue(),/^09:05/);
  await page.screenshot({path:`test-report/${name}-multi-review.png`,fullPage:true});
  await page.reload();await page.locator('[data-tab=review]').click();await page.waitForFunction(()=>document.querySelectorAll('.result-tab').length===4);
  assert.equal((await readRows(page))[0],'0905');await page.locator('.result-tab[data-engine="ppocr-v5-en"]').click();assert.equal((await readRows(page))[0],'0910');
  await page.locator('[data-tab=settings]').click();await page.locator('#show-model-storage').click();await page.waitForFunction(()=>document.querySelector('#model-storage').children.length>0||document.querySelector('#notice').classList.contains('error'));
  console.log('CACHE_DIAGNOSTIC',name,JSON.stringify(await page.evaluate(async()=>({notice:document.querySelector('#notice').textContent,storage:document.querySelector('#model-storage').textContent,keys:await caches.keys()}))));
  assert.match(await page.locator('#model-storage').innerText(),/已下載保存/);
  await page.screenshot({path:`test-report/${name}-multi-model-storage.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>localStorage.getItem('strforge.state.v2')),'KEEP');
  const bad=requests.filter(r=>!r.url.startsWith(base)&&!r.url.startsWith('blob:http://127.0.0.1:4173/')&&!r.url.startsWith('data:image/'));
  assert.deepEqual(bad,[]);assert.equal(requests.some(r=>r.method!=='GET'||r.post),false,'No image upload or external inference');assert.deepEqual(errors,[]);
  reports.push({browser:name,engines:raw,independentEdits:true,draftReload:true,activeExport:true,noUpload:true,errors});
  // Simulate a blocked selected model after CNN completion: cancelling must retain CNN.
  await page.locator('[data-tab=scan]').click();await page.locator('#demo').click();
  for(const id of ['ppocr-v5-ch','ppocr-v4-en'])await page.locator(`input[name=engine][value="${id}"]`).uncheck();
  // Block the manifest (it is intentionally revalidated); no short fetch retries.
  let hold,arrive;const reached=new Promise(r=>arrive=r);
  await context.route('**/models/local-engines.json',r=>{hold=r;arrive();});
  await page.locator('#recognize').click();await reached;await page.locator('#cancel').click();await hold.abort().catch(()=>{});await context.unroute('**/models/local-engines.json');
  await page.waitForFunction(()=>!document.querySelector('#review').hidden);assert.deepEqual(await readRows(page),['0900','0910','1002','1004']);
  reports.at(-1).cancelPreservesCompleted=true;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }catch(error){console.log('MULTI_FAILURE',name,JSON.stringify({error:String(error),notice:await page.locator('#notice').innerText(),errors}));await page.screenshot({path:`test-report/${name}-multi-failed.png`,fullPage:true});throw error;}finally{await context.close();await browser.close();}
}
console.log('MULTI_MODEL_RESULT',JSON.stringify(reports));await writeFile('test-report/multi-models.json',JSON.stringify(reports,null,2));
}finally{server.kill();}
