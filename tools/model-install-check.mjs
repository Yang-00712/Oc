// Actual model import + actual inference with all model/runtime HTTP blocked.
// No user photograph or private training data is used or uploaded by this test.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit,devices}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const base='http://127.0.0.1:4173/Oc/',reports=[];
await mkdir('test-report',{recursive:true});
const waitIdle=page=>page.waitForFunction(()=>document.querySelector('#cancel-install').hidden,{},{timeout:90000});
const allPack='test-report/model-packs/Oc-Models.zip';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const downloadPacks=[['download-models-all','Oc-Models.zip'],['download-models-general','Oc-PP-OCRv5-General.zip']];
// Published download files must be byte-identical to the trusted deterministic
// build, not HTML error pages, missing files, or a different bundle revision.
for(const [,name]of downloadPacks)assert.equal(digest(await readFile('downloads/'+name)),digest(await readFile('test-report/model-packs/'+name)),name+' published bundle differs');
// Flip a runtime source byte without changing ZIP metadata: integrity must reject
// it BEFORE writing any previously working model/runtime file.
const corrupt=Buffer.from(await readFile(allPack));
const originalScript=await readFile('vendor/ort/ort.wasm.min.mjs');
const pos=corrupt.indexOf(originalScript);assert.ok(pos>0);corrupt[pos]^=1;
await writeFile('test-report/corrupt-model-pack.zip',corrupt);
try{
 for(const[name,engine,options]of[['chromium',chromium,{viewport:{width:390,height:844}}],['webkit',webkit,{...devices['iPhone 14'],locale:'zh-TW'}]]){
  const browser=await engine.launch(),context=await browser.newContext(options),page=await context.newPage(),requests=[],errors=[];
  try{
   context.on('request',r=>requests.push({url:r.url(),method:r.method(),post:r.postData()}));page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('還沒有'));
   assert.equal(requests.some(r=>/\/models\/|\/vendor\//.test(r.url)),false);
   await page.evaluate(()=>localStorage.setItem('strforge.state.v2','KEEP-STRFORGE'));
   await page.locator('[data-tab=review]').click();await page.locator('#add-row').click();await page.locator('.row-edit input').fill('0910');await page.locator('#confirm-valid').click();
   await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
   await page.locator('[data-tab=settings]').click();
   // Exercise the actual settings download links in both engines, then import
   // the file the browser saved. Nothing navigates to a new application page.
   const scratch=await mkdtemp(join(tmpdir(),'oc-pack-download-'));
   const devicePack=join(scratch,'Oc-Models.zip');
   try{
    for(const [id,name]of downloadPacks){
     const link=page.locator('#'+id);assert.equal(await link.getAttribute('download'),name);
     const pending=page.waitForEvent('download');await link.click();const download=await pending;
     assert.equal(download.suggestedFilename(),name);const saved=join(scratch,name);await download.saveAs(saved);
     assert.equal(digest(await readFile(saved)),digest(await readFile('downloads/'+name)));
    }
    assert.equal(page.url(),base,'Downloading must leave the Oc document open');
   }catch(error){await rm(scratch,{recursive:true,force:true});throw error;}
   // Both foreign and same-origin model/runtime network failure are irrelevant
   // when importing the exact public ZIP from the device's File input.
   await context.route('**/models/**',r=>r.abort('failed'));await context.route('**/vendor/**',r=>r.abort('failed'));
   const beforeImport=requests.length;
   await page.locator('#model-package').setInputFiles(devicePack);await waitIdle(page);
   await rm(scratch,{recursive:true,force:true});
   assert.match(await page.locator('#install-status').innerText(),/已匯入 3 個模型/);
   assert.equal(await page.locator('[data-model-action=install]').count(),3);
   assert.equal((await page.locator('#model-storage').innerText()).match(/可辨識/g)?.length,3);
   assert.equal(requests.slice(beforeImport).some(r=>/\/models\/|\/vendor\//.test(r.url)),false,'Offline import has no catalog, model or runtime requests');
   await page.screenshot({path:`test-report/${name}-installed.png`,fullPage:true});
   const keysBefore=await page.evaluate(async()=>await(await import('./src/model-cache.js')).modelFileKeys());assert.equal(keysBefore.length,9);
   await page.locator('#model-package').setInputFiles('test-report/corrupt-model-pack.zip');await waitIdle(page);
   assert.match(await page.locator('#install-status').innerText(),/完整性不符.*ort.wasm.min.mjs/);
   assert.deepEqual(await page.evaluate(async()=>await(await import('./src/model-cache.js')).modelFileKeys()),keysBefore);
   // Reload the document, not merely reusing in-memory weights from installation.
   await page.reload();await page.locator('[data-tab=review]').click();await page.waitForSelector('.row-edit input');
   assert.equal(await page.locator('.row-edit input').inputValue(),'0910');
   await page.locator('[data-tab=scan]').click();await page.locator('input[name=engine][value=cnn]').uncheck();
   for(const id of ['ppocr-v5-en','ppocr-v5-ch','ppocr-v4-en'])await page.locator(`input[name=engine][value="${id}"]`).check();
   await page.locator('#demo').click();const beforeInference=requests.length;
   await page.locator('#recognize').click();await page.waitForSelector('#review:not([hidden])',{timeout:240000});
   assert.equal(await page.locator('.result-tab:disabled').count(),0);
   assert.equal(await page.locator('.result-tab').count(),3);
   const raw={};for(const id of ['ppocr-v5-en','ppocr-v5-ch','ppocr-v4-en']){await page.locator(`.result-tab[data-engine="${id}"]`).click();raw[id]=await page.locator('.row-edit input').evaluateAll(v=>v.map(x=>x.value));assert.equal(raw[id].length,4);assert.ok(raw[id].some(Boolean));}
   assert.equal(requests.slice(beforeInference).some(r=>/\/models\/|\/vendor\//.test(r.url)),false,'Real inference reads all weights, configs, runtime mjs and wasm from local storage');
   assert.equal(await page.evaluate(()=>localStorage.getItem('strforge.state.v2')),'KEEP-STRFORGE');
   for(let i=0;i<4;i++)await page.locator('.row-edit input').nth(i).fill(['0900','0910','1002','1004'][i]);await page.locator('#confirm-valid').click();
   const downloaded=page.waitForEvent('download');await page.locator('#txt').click();await(await downloaded).saveAs(`test-report/${name}-installed-result.txt`);
   assert.equal((await readFile(`test-report/${name}-installed-result.txt`,'utf8')).replace(/\r/g,''),'09:00\n09:10\n10:02\n10:04\n');
   await page.screenshot({path:`test-report/${name}-installed-inference.png`,fullPage:true});
   // A raw Load failed must now name the file and preserve the already complete
   // runtime plus all other models. No automatic re-download loop.
   await page.locator('[data-tab=settings]').click();await page.locator('#show-model-storage').click();
   await page.locator('[data-model-action=clear]').first().click();await page.waitForFunction(()=>document.querySelector('#model-storage').textContent.includes('尚未完整下載'));
   const beforeFailure=requests.length;await page.locator('[data-model-action=install]').first().click();await waitIdle(page);
   assert.match(await page.locator('#install-status').innerText(),/下載失敗：models\/ppocr-v5-en\/model.onnx/);
   assert.equal(requests.slice(beforeFailure).filter(r=>r.url.includes('/models/ppocr-v5-en/model.onnx')).length,1);
   await context.unroute('**/models/**');await context.unroute('**/vendor/**');
   // Hold a download beyond the old four-minute boundary using the test clock,
   // without waiting four real minutes or changing production timeouts.
   await page.clock.install();
   let held,arrive;const reached=new Promise(r=>arrive=r);
   await context.route('**/models/ppocr-v5-en/model.onnx*',r=>{held=r;arrive();});
   await page.locator('[data-model-action=install]').first().click();await reached;await page.clock.fastForward(241000);
   assert.equal(await page.locator('#cancel-install').isVisible(),true,'Four minute inference timer must not end download/install');
   await page.locator('#cancel-install').click();await waitIdle(page);await held.abort().catch(()=>{});await context.unroute('**/models/ppocr-v5-en/model.onnx*');
   assert.match(await page.locator('#install-status').innerText(),/取消/);
   await page.locator('[data-tab=review]').click();assert.equal(await page.locator('.row-edit input').first().inputValue(),'0900');
   assert.deepEqual(errors,[]);assert.equal(requests.some(r=>r.method!=='GET'||r.post),false);
   const external=requests.filter(r=>!r.url.startsWith(base)&&!r.url.startsWith('blob:http://127.0.0.1:4173/')&&!r.url.startsWith('data:image/'));assert.deepEqual(external,[]);
   reports.push({browser:name,settingsDownloadLinks:true,downloadedFileImport:true,zipImport:true,modelsAndRuntimeSurviveReload:true,corruptRejected:true,realThreeModelInferenceWithoutAssetNetwork:raw,resultExport:true,downloadFailureNamesFile:true,downloadBeyondFourMinutes:true,cancelPreservesDraft:true,noUpload:true,errors});
  }catch(error){console.error('INSTALL_FAILURE',name,String(error),await page.locator('#notice').innerText(),errors);await page.screenshot({path:`test-report/${name}-install-failed.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();await browser.close();}
 }
}finally{server.kill();await writeFile('test-report/model-install.json',JSON.stringify(reports,null,2));}
console.log('MODEL_INSTALL_RESULT',JSON.stringify(reports));
