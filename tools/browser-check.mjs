import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const {chromium,webkit,devices}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});
const results=[];
try{
for(const [name,engine,options] of [['chromium',chromium,{viewport:{width:390,height:844}}],['webkit',webkit,{...devices['iPhone 14'],locale:'zh-TW'}]]){
 const browser=await engine.launch();
 try{
  const context=await browser.newContext(options),page=await context.newPage(),requests=[],errors=[];
  page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:4173/Oc/');await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('還沒有'));
  assert.ok(!requests.some(url=>url.includes('/models/')||url.includes('ocr-worker')||url.includes('cnn.js')),'No model/inference on startup');
  await page.evaluate(()=>localStorage.setItem('strforge.state.v2','KEEP-STRFORGE'));
  await page.screenshot({path:`test-report/${name}-scan.png`,fullPage:true});
  await page.locator('#demo').click();await page.waitForSelector('#photo-editor:not([hidden])');
  await page.locator('#recognize').click();await page.waitForSelector('#review:not([hidden])');
  const values=await page.locator('.row-edit input').evaluateAll(items=>items.map(item=>item.value));assert.deepEqual(values,['0900','0910','1002','1004']);
  await page.locator('#copy').click();assert.match(await page.locator('#notice').innerText(),/確認/);
  await page.locator('#collect').check();await page.locator('.row-edit input').nth(2).fill('1003');
  await page.locator('#confirm-valid').click();await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('已確認 4 列'));
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
  await page.locator('#txt').click();await page.waitForFunction(()=>document.querySelector('#output').value.includes('10:03'));
  assert.equal(await page.locator('#output').inputValue(),'09:00\n09:10\n10:03\n10:04\n');
  await page.screenshot({path:`test-report/${name}-review.png`,fullPage:true});
  await page.reload();await page.locator('[data-tab=review]').click();await page.waitForFunction(()=>document.querySelectorAll('.row').length===4);
  assert.equal(await page.locator('.row-edit input').nth(2).inputValue(),'1003');
  await page.locator('[data-tab=settings]').click();await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('教材 4 /'));
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-training').click();const download=await downloadPromise;await download.saveAs(`test-report/${name}-training.zip`);
  await page.locator('#clear-training').click();await page.waitForFunction(()=>document.querySelector('#storage-status').textContent.includes('教材 0 /'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('strforge.state.v2')),'KEEP-STRFORGE');
  await page.screenshot({path:`test-report/${name}-settings.png`,fullPage:true});
  await page.locator('[data-tab=review]').click();await page.locator('.row-edit input').first().fill('0968');await page.locator('.confirm-row').first().click();assert.match(await page.locator('#notice').innerText(),/分鐘/);
  // A failed model read must leave the existing corrected draft untouched.
  await page.locator('[data-tab=scan]').click();await page.locator('#demo').click();await page.waitForSelector('#photo-editor:not([hidden])');
  await context.route('**/models/time-digit.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.locator('#recognize').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('完整性'));
  await page.locator('[data-tab=review]').click();assert.equal(await page.locator('.row-edit input').first().inputValue(),'0968');
  await context.unroute('**/models/time-digit.json*');
  assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:4173/')),'No photo/API requests leave the site');
  assert.deepEqual(errors,[]);
  results.push({browser:name,demo:values,correction:true,draftReload:true,trainingExport:true,clearIsolated:true,invalidTimeBlocked:true,modelFailurePreservesDraft:true,errors});
  await context.close();
  // 320px layout and unavailable IndexedDB must still leave the manual path working.
  const narrow=await browser.newContext({...options,viewport:{width:320,height:740}}),np=await narrow.newPage();
  await np.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:{open(){throw new Error('Injected storage block');}}});});
  await np.goto('http://127.0.0.1:4173/Oc/');await np.waitForFunction(()=>document.querySelector('#notice').textContent.includes('無法還原'));
  await np.locator('[data-tab=review]').click();await np.locator('#add-row').click();await np.locator('.row-edit input').fill('0900');
  assert.equal(await np.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await np.screenshot({path:`test-report/${name}-320.png`,fullPage:true});await narrow.close();
 }finally{await browser.close();}
}
console.log('BROWSER_RESULT '+JSON.stringify(results));
await writeFile('test-report/browser.json',JSON.stringify(results,null,2));
}finally{server.kill();}
