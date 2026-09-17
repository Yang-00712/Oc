// Public model bytes must survive inference Worker termination AND document reload.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});const reports=[];
const workerCode=`self.onmessage=({data})=>self.postMessage({bytes:data.byteLength,last:new Uint8Array(data)[data.byteLength-1]});`;
try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(),context=await browser.newContext(),page=await context.newPage();
 try{
  const workerUrl='http://127.0.0.1:4173/Oc/tests/cache-probe-worker.js';
  await context.route(workerUrl,route=>route.fulfill({status:200,contentType:'text/javascript',body:workerCode}));
  await page.goto('http://127.0.0.1:4173/Oc/');
  const result=await page.evaluate(async workerUrl=>{
   const cache=await import('./src/model-cache.js');
   const fromWorkers=[];
   for(const size of [1024,7872351,16631306]){
    const key=new URL('models/probe-'+size+'/model.onnx',location.href).href,bytes=new Uint8Array(size);bytes[size-1]=71;
    await cache.writeModelFile(key,bytes.buffer);
    const data=await cache.readModelFile(key),worker=new Worker(workerUrl);
    try{
     const fromWorker=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Model transfer probe timed out')),10000);
      worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message||'Same-origin worker failed'));};worker.postMessage(data,[data]);
     });
     worker.terminate();const after=new Uint8Array(await cache.readModelFile(key));
     fromWorkers.push({size,fromWorker,detachedBytes:data.byteLength,afterBytes:after.length,afterLast:after[after.length-1]});
    }finally{worker.terminate();}
   }
   return fromWorkers;
  },workerUrl);
  await page.reload();
  const reopened=await page.evaluate(async()=>{
   const cache=await import('./src/model-cache.js'),files=[];
   for(const key of await cache.modelFileKeys()){const bytes=new Uint8Array(await cache.readModelFile(key));files.push({key,bytes:bytes.length,last:bytes[bytes.length-1]});}
   return files;
  });
  reports.push({browser:name,result,reopened});console.log('MODEL_STORAGE_PROBE',name,JSON.stringify(reports.at(-1)));
  assert.equal(reopened.length,3);
  for(const item of result){
   assert.deepEqual(item.fromWorker,{bytes:item.size,last:71});assert.equal(item.detachedBytes,0,'Weight buffer must transfer, not copy');
   assert.equal(item.afterBytes,item.size);assert.equal(item.afterLast,71);
   assert.ok(reopened.some(f=>f.bytes===item.size&&f.last===71),'Reload must retain the completed model write');
  }
 }finally{await context.close();await browser.close();}
}}finally{await writeFile('test-report/cache-probe.json',JSON.stringify(reports,null,2));server.kill();}
