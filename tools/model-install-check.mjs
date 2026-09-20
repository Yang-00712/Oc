// Browser download/import check for the one visible PP-OCRv5 general model.
// The older public bundles and their assets remain in the repository.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {readStoredZip} from '../src/model-pack.js';

const {chromium,webkit,devices}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const base='http://127.0.0.1:4173/Oc/',reports=[],packName='Oc-PP-OCRv5-General.zip';
const waitRoute=(promise)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('等待模型請求逾時')),30000);})]).finally(()=>clearTimeout(timer));};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const waitIdle=page=>page.waitForFunction(()=>document.querySelector('#cancel-install').hidden,{},{timeout:90000});
await mkdir('test-report',{recursive:true});
const publishedEntries=await readStoredZip(new Blob([await readFile('downloads/'+packName)]));
const generatedEntries=await readStoredZip(new Blob([await readFile('test-report/model-packs/'+packName)]));
assert.deepEqual([...publishedEntries.keys()],[...generatedEntries.keys()]);
for(const [name,entry] of publishedEntries) assert.equal(digest(Buffer.from(await entry.read())),digest(Buffer.from(await generatedEntries.get(name).read())),`Published ZIP content differs: ${name}`);
const corrupt=Buffer.from(await readFile('test-report/model-packs/'+packName));
const originalScript=await readFile('vendor/ort/ort.wasm.min.mjs');
const position=corrupt.indexOf(originalScript);assert.ok(position>0);corrupt[position]^=1;
await writeFile('test-report/corrupt-model-pack.zip',corrupt);

try{
 for(const[name,engine,options]of[['chromium',chromium,{viewport:{width:390,height:844}}],['webkit',webkit,{...devices['iPhone 14'],locale:'zh-TW'}]].filter(([name])=>!process.env.OC_BROWSER||name===process.env.OC_BROWSER)){
  const browser=await engine.launch(),context=await browser.newContext(options),page=await context.newPage(),requests=[],errors=[];
  try{
   context.on('request',request=>requests.push({url:request.url(),method:request.method(),post:request.postData()}));
   page.on('pageerror',error=>errors.push(String(error)));page.on('dialog',dialog=>dialog.accept());
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('還沒有'));
   assert.equal(requests.some(request=>/\/models\/|\/vendor\//.test(request.url)),false);
   await page.evaluate(()=>localStorage.setItem('strforge.state.v2','KEEP-STRFORGE'));
   await page.locator('[data-tab=review]').click();await page.locator('#add-row').click();
   await page.locator('.row-edit input').fill('0910');await page.locator('#confirm-valid').click();
   await page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
   await page.locator('[data-tab=settings]').click();
   assert.equal(await page.locator('#download-models-all').count(),0);
   const link=page.locator('#download-models-general');
   assert.equal(await link.getAttribute('download'),packName);
   const scratch=await mkdtemp(join(tmpdir(),'oc-pack-download-')),devicePack=join(scratch,packName);
   try{
    const pending=page.waitForEvent('download');await link.click();const download=await pending;
    assert.equal(download.suggestedFilename(),packName);await download.saveAs(devicePack);
    assert.equal(digest(await readFile(devicePack)),digest(await readFile('downloads/'+packName)));
    assert.equal(page.url(),base);
    await context.route('**/models/**',route=>route.abort('failed'));
    await context.route('**/vendor/**',route=>route.abort('failed'));
    const beforeImport=requests.length;
    await page.locator('#model-package').setInputFiles(devicePack);await waitIdle(page);
    await page.waitForFunction(()=>document.querySelector('#model-storage').textContent.includes('可辨識'));
    assert.match(await page.locator('#install-status').innerText(),/已匯入 1 個模型/);
    assert.equal(requests.slice(beforeImport).some(request=>/\/models\/|\/vendor\//.test(request.url)),false);
   }finally{await rm(scratch,{recursive:true,force:true});}
   assert.equal(await page.locator('[data-model-action=install]').count(),1);
   assert.equal((await page.locator('#model-storage').innerText()).match(/可辨識/g)?.length,1);
   const keysBefore=await page.evaluate(async()=>await(await import('./src/model-cache.js')).modelFileKeys());
   assert.ok(keysBefore.length>0);
   await page.locator('#model-package').setInputFiles('test-report/corrupt-model-pack.zip');await waitIdle(page);
   assert.match(await page.locator('#install-status').innerText(),/完整性不符.*ort.wasm.min.mjs/);
   assert.deepEqual(await page.evaluate(async()=>await(await import('./src/model-cache.js')).modelFileKeys()),keysBefore);
   await page.reload();await page.locator('[data-tab=review]').click();await page.waitForSelector('.row-edit input');
   assert.equal(await page.locator('.row-edit input').inputValue(),'0910');
   await page.locator('[data-tab=scan]').click();await page.locator('#demo').click();
   const beforeInference=requests.length;await page.locator('#recognize').click();
   await page.waitForSelector('#review:not([hidden])',{timeout:240000});
   assert.equal(await page.locator('.result-tab').count(),1);
   assert.equal(await page.locator('.result-tab[data-engine="ppocr-v5-ch"]:disabled').count(),0);
   const raw=await page.locator('.row-edit input').evaluateAll(items=>items.map(item=>item.value));
   assert.equal(raw.length,4);assert.ok(raw.some(Boolean));assert.ok(raw.every(value=>/^[0-9]*$/.test(value)));
   assert.equal(requests.slice(beforeInference).some(request=>/\/models\/|\/vendor\//.test(request.url)),false,'Real inference must use imported local files');
   assert.equal(await page.evaluate(()=>localStorage.getItem('strforge.state.v2')),'KEEP-STRFORGE');
   for(let i=0;i<4;i++)await page.locator('.row-edit input').nth(i).fill(['0900','0910','1002','1004'][i]);
   await page.locator('#confirm-valid').click();
   await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('已確認 4 列'));
   const pendingText=page.waitForEvent('download');await page.locator('#txt').click();
   const resultPath=`test-report/${name}-installed-result.txt`;await(await pendingText).saveAs(resultPath);
   assert.equal((await readFile(resultPath,'utf8')).replace(/\r/g,''),'09:00\n09:10\n10:02\n10:04\n');
   await page.locator('[data-tab=settings]').click();await page.locator('#show-model-storage').click();
   await page.locator('[data-model-action=clear]').click();
   await page.waitForFunction(()=>document.querySelector('#model-storage').textContent.includes('尚未完整下載'));
   const beforeFailure=requests.length;await page.locator('[data-model-action=install]').click();await waitIdle(page);
   assert.match(await page.locator('#install-status').innerText(),/下載失敗：models\/ppocr-v5-ch\/model.onnx/);
   assert.equal(requests.slice(beforeFailure).filter(request=>request.url.includes('/models/ppocr-v5-ch/model.onnx')).length,1);
   await context.unroute('**/models/**');await context.unroute('**/vendor/**');
   await page.clock.install();
   let held,arrive;const reached=new Promise(resolve=>arrive=resolve);
   await context.route('**/models/ppocr-v5-ch/model.onnx*',route=>{held=route;arrive();});
   await page.locator('[data-model-action=install]').click();await waitRoute(reached);await page.clock.fastForward(241000);
   assert.equal(await page.locator('#cancel-install').isVisible(),true,'Download must outlive the inference timer');
   await page.locator('#cancel-install').click();await waitIdle(page);await held.abort().catch(()=>{});
   await context.unroute('**/models/ppocr-v5-ch/model.onnx*');
   assert.match(await page.locator('#install-status').innerText(),/取消/);
   await page.locator('[data-tab=review]').click();assert.equal(await page.locator('.row-edit input').first().inputValue(),'0900');
   assert.deepEqual(errors,[]);assert.equal(requests.some(request=>request.method!=='GET'||request.post),false);
   const external=requests.filter(request=>!request.url.startsWith(base)&&!request.url.startsWith('blob:http://127.0.0.1:4173/')&&!request.url.startsWith('data:image/'));
   assert.deepEqual(external,[]);
   reports.push({browser:name,digitsOnly:true,settingsDownloadLink:true,downloadedFileImport:true,zipImport:true,modelAndRuntimeSurviveReload:true,corruptRejected:true,realInferenceWithoutAssetNetwork:raw,resultExport:true,downloadFailureNamesFile:true,downloadBeyondFourMinutes:true,cancelPreservesDraft:true,noUpload:true,errors});
  }catch(error){console.error('INSTALL_FAILURE',name,String(error),errors);await page.screenshot({path:`test-report/${name}-install-failed.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();await browser.close();}
 }
}finally{server.kill();await writeFile('test-report/model-install.json',JSON.stringify(reports,null,2));}
console.log('MODEL_INSTALL_RESULT',JSON.stringify(reports));
