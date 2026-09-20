// Chromium and WebKit exercise the single visible PP-OCRv5 general model.
// Every image here is synthetic; no user photograph enters this check.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const {chromium,webkit,devices}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});
const base='http://127.0.0.1:4173/Oc/',reports=[];
const waitRoute=(promise)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('等待模型請求逾時')),30000);})]).finally(()=>clearTimeout(timer));};
const readRows=page=>page.locator('.row-edit input').evaluateAll(items=>items.map(item=>item.value));
const waitSaved=page=>page.waitForFunction(()=>document.querySelector('#save-status').textContent.includes('已保存'));
const makeGrid=async (page,missingTop=false,wide=false)=>{
 const data=await page.evaluate(({missingTop,wide})=>{
  const canvas=document.createElement('canvas');canvas.width=wide?280:112;canvas.height=790;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,790);
  if(wide){const shade=ctx.createLinearGradient(0,0,0,790);shade.addColorStop(0,'white');shade.addColorStop(1,'rgb(140,140,140)');ctx.fillStyle=shade;ctx.fillRect(0,0,176,790);ctx.fillStyle='rgb(90,190,90)';ctx.fillRect(176,0,104,790);}
  ctx.fillStyle='#141414';
  const lines=[5];for(let i=0;i<30;i++)lines.push(lines.at(-1)+22+(i%4)*2);
  for(const y of (missingTop?lines.slice(1):lines))ctx.fillRect(wide?80:2,y,wide?96:108,1);
  if(wide){
   for(let y=5;y<=lines.at(-1);y++){ctx.fillRect(80,y,1,1);ctx.fillRect(95-Math.round(15*y/lines.at(-1)),y,1,1);ctx.fillRect(175,y,1,1);}
  }else{ctx.fillRect(2,5,1,lines.at(-1)-4);ctx.fillRect(109,5,1,lines.at(-1)-4);}
  for(let row=0;row<30;row++)if(row!==11)for(const x of (wide?[111,126,141,156]:[21,40,59,78]))ctx.fillRect(x,lines[row]+7,2,7);
  return canvas.toDataURL('image/png').split(',')[1];
 },{missingTop,wide});
 await page.locator('#photo').setInputFiles({name:'synthetic-grid.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('已載入照片'));
};


try{
 for(const[name,engine,options]of[['chromium',chromium,{viewport:{width:390,height:844}}],['webkit',webkit,{...devices['iPhone 14'],locale:'zh-TW'}]].filter(([name])=>!process.env.OC_BROWSER||name===process.env.OC_BROWSER)){
  const browser=await engine.launch(),context=await browser.newContext(options),page=await context.newPage(),requests=[],errors=[];
  try{
   page.on('dialog',dialog=>dialog.accept());page.on('pageerror',error=>errors.push(String(error)));
   context.on('request',request=>requests.push({url:request.url(),method:request.method(),post:request.postData()}));
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('還沒有'));
   assert.equal(requests.some(request=>/\/models\/|\/vendor\/|line-worker|ocr-worker/.test(request.url)),false,'Homepage must load no model');
   assert.equal(await page.locator('#engine-options .engine-option').count(),1);
   assert.match(await page.locator('#engine-options').innerText(),/PP-OCRv5 通用/);
   await page.evaluate(()=>localStorage.setItem('strforge.state.v2','KEEP'));
   await page.locator('#demo').click();await page.waitForSelector('#photo-editor:not([hidden])');
   await page.locator('#recognize').click();await page.waitForSelector('#review:not([hidden])',{timeout:240000});
   assert.equal(await page.locator('.result-tab').count(),1);
   assert.equal(await page.locator('.result-tab[data-engine="ppocr-v5-ch"]:disabled').count(),0);
   assert.match(await page.locator('#digits-only-note').innerText(),/0–9/);
   const raw=await readRows(page);assert.equal(raw.length,4);assert.ok(raw.some(Boolean));
   assert.ok(raw.every(value=>/^[0-9]*$/.test(value)),'Real Worker inference must emit only digits');
   await waitSaved(page);
   const initial=await page.evaluate(async()=>await(await import('./src/store.js')).getState('draft'));
   assert.deepEqual(initial.modelResults.map(run=>run.engine),['ppocr-v5-ch']);
   for(const row of initial.modelResults[0].rows){assert.equal(row.numericOnly,true);assert.match(row.raw,/^[0-9]*$/);assert.equal(typeof row.transcript,'string');assert.equal(row.confirmed,false);}
   await page.locator('.row details').first().evaluate(element=>{element.open=true;});
   assert.match(await page.locator('.row-message').first().innerText(),/僅辨識數字/);
   for(let i=0;i<4;i++)await page.locator('.row-edit input').nth(i).fill(['0900','0910','1002','1004'][i]);
   await page.locator('#confirm-valid').click();
   await page.waitForFunction(()=>document.querySelector('#review-count').textContent.includes('已確認 4 列'));await waitSaved(page);
   const textDownload=page.waitForEvent('download');await page.locator('#txt').click();
   const textPath=`test-report/${name}-single-result.txt`;await(await textDownload).saveAs(textPath);
   assert.equal((await readFile(textPath,'utf8')).replace(/\r/g,''),'09:00\n09:10\n10:02\n10:04\n');
   assert.equal(await page.locator('#output').inputValue(),'09:00\n09:10\n10:02\n10:04\n');
   await page.reload();await page.locator('[data-tab=review]').click();await page.waitForSelector('.row-edit input');
   assert.deepEqual(await readRows(page),['0900','0910','1002','1004']);
   const reloaded=await page.evaluate(async()=>await(await import('./src/store.js')).getState('draft'));
   assert.deepEqual(reloaded.modelResults[0].rows.map(row=>({raw:row.raw,transcript:row.transcript})),initial.modelResults[0].rows.map(row=>({raw:row.raw,transcript:row.transcript})));
   await page.locator('[data-tab=settings]').click();await page.locator('#show-model-storage').click();
   await page.waitForFunction(()=>document.querySelector('#model-storage').children.length>0);
   assert.equal(await page.locator('#model-storage .model-storage-line').count(),1);
   assert.match(await page.locator('#model-storage').innerText(),/PP-OCRv5 通用.*已下載保存/s);
   await page.locator('[data-tab=scan]').click();await page.locator('#demo').click();
   const beforeWarm=requests.length;await page.locator('#recognize').click();
   await page.waitForSelector('#review:not([hidden])',{timeout:240000});
   assert.equal(requests.slice(beforeWarm).some(request=>request.url.includes('/models/ppocr-v5-ch/model.onnx')),false,'Verified cached weights must remain usable');

   await page.locator('[data-tab=scan]').click();await page.locator('#row-mode').selectOption('grid30');
   await makeGrid(page);await page.locator('#recognize').click();
   await page.waitForSelector('#review:not([hidden])',{timeout:240000});await waitSaved(page);
   assert.equal(await page.locator('.row-edit input').count(),30);
   assert.equal(await page.locator('#add-row').isDisabled(),true);
   assert.equal(await page.locator('.row-head button[aria-label^="刪除"]').count(),0);
   const gridDraft=await page.evaluate(async()=>await(await import('./src/store.js')).getState('draft'));
   assert.deepEqual(gridDraft.rows.map(row=>row.formSlot),Array.from({length:30},(_,i)=>i+1));
   assert.equal(gridDraft.rows[11].raw,'','Blank cell must remain empty');
   // Wide selection, coloured mask and slanted narrow gutter: actual OCR still
   // receives only the time cell, and a blank cell must not become a border digit.
   await page.locator('[data-tab=scan]').click();await makeGrid(page,false,true);
   await page.locator('#recognize').click();await page.waitForSelector('#review:not([hidden])',{timeout:240000});await waitSaved(page);
   const wideDraft=await page.evaluate(async()=>await(await import('./src/store.js')).getState('draft'));
   assert.equal(wideDraft.rows.length,30);assert.equal(wideDraft.rows[11].raw,'');
   assert.equal(wideDraft.rows[11].reason.includes('空白'),true);
   const greenPixels=await page.evaluate(async()=>{
    const image=document.querySelector('.row img');await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
    let green=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]-pixels[i]>40&&pixels[i+1]-pixels[i+2]>40)green++;
    return green;
   });
   assert.equal(greenPixels,0,'The neighbouring green area must stay out of row thumbnails');
   // Missing outer rule: automatic mode must fail without replacing the draft.
   await page.locator('[data-tab=scan]').click();await makeGrid(page,true);
   await page.locator('#recognize').click();
   await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('偵測到 30 條'));
   assert.equal((await page.evaluate(async()=>await(await import('./src/store.js')).getState('draft'))).rows.length,30);
   await page.locator('#grid-edges').selectOption('crop-top');await page.locator('#recognize').click();
   await page.waitForSelector('#review:not([hidden])',{timeout:240000});await waitSaved(page);
   const repaired=await page.evaluate(async()=>await(await import('./src/store.js')).getState('draft'));
   assert.equal(repaired.rows.length,30);assert.match(repaired.rows[0].reason,/上緣使用你指定/);
   assert.equal(repaired.rows[0].confirmed,false);assert.equal(repaired.rows[11].raw,'');
   assert.deepEqual(repaired.rows.map(row=>row.formSlot),Array.from({length:30},(_,i)=>i+1));
   await page.locator('.row details').first().evaluate(element=>{element.open=true;});
   assert.match(await page.locator('.row-message').first().innerText(),/上緣使用你指定/);
   const beforeCancel=await readRows(page);
   await page.locator('[data-tab=settings]').click();await page.evaluate(async()=>{const {clearModel}=await import('./src/engine-assets.js');await clearModel('ppocr-v5-ch');});
   await page.locator('[data-tab=scan]').click();await page.locator('#row-mode').selectOption('auto');await page.locator('#demo').click();
   let held,arrive;const reached=new Promise(resolve=>arrive=resolve);
   await context.route('**/models/ppocr-v5-ch/model.onnx*',route=>{held=route;arrive();});
   await page.locator('#recognize').click();await waitRoute(reached);await page.locator('#cancel').click();
   await held.abort().catch(()=>{});await context.unroute('**/models/ppocr-v5-ch/model.onnx*');
   await page.waitForFunction(()=>document.querySelector('#cancel').hidden);
   await page.locator('[data-tab=review]').click();
   assert.deepEqual(await readRows(page),beforeCancel,'Cancelled new scan preserves the previous 30-cell draft');
   assert.equal(await page.evaluate(()=>localStorage.getItem('strforge.state.v2')),'KEEP');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const external=requests.filter(request=>!request.url.startsWith(base)&&!request.url.startsWith('blob:http://127.0.0.1:4173/')&&!request.url.startsWith('data:image/'));
   assert.deepEqual(external,[]);assert.equal(requests.some(request=>request.method!=='GET'||request.post),false,'No image upload or remote inference');assert.deepEqual(errors,[]);
   await page.screenshot({path:`test-report/${name}-grid30-review.png`,fullPage:true});
   reports.push({browser:name,engine:'ppocr-v5-ch',digitsOnly:true,raw,gridSlots:30,blankSlot:12,wideCrop:true,shadedPaper:true,slantedGutter:true,colouredMarginExcluded:true,explicitMissingOuterEdge:true,edgeWarning:true,activeExport:true,draftReload:true,warmWeights:true,cancelPreservesDraft:true,noUpload:true,errors});
  }catch(error){console.error('SINGLE_MODEL_FAILURE',name,String(error),errors);await page.screenshot({path:`test-report/${name}-single-failed.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();await browser.close();}
 }
 console.log('SINGLE_MODEL_RESULT',JSON.stringify(reports));
 await writeFile('test-report/multi-models.json',JSON.stringify(reports,null,2));
}finally{server.kill();}
