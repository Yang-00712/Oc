// Match production: Window caches verified weights, transfers to Worker, then
// terminates Worker. Never assume Worker CacheStorage is shared on WebKit.
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
   const cacheName='oc-synthetic-cache-probe',url=new URL('models/synthetic-probe',location.href).href;
   const worker=new Worker(workerUrl);
   try{
    const cache=await caches.open(cacheName),bytes=new Uint8Array(1024);bytes[1023]=71;
    await cache.put(url,new Response(bytes));
    const transfer=(await cache.match(url)).arrayBuffer();const data=await transfer;
    const fromWorker=await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('Cache probe timed out')),10000);
     worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message||'Same-origin worker failed'));};worker.postMessage(data,[data]);
    });
    worker.terminate();
    const after=new Uint8Array(await (await cache.match(url)).arrayBuffer());
    return{fromWorker,detachedBytes:data.byteLength,windowKeys:(await cache.keys()).map(r=>r.url),afterBytes:after.length,afterLast:after[1023]};
   }finally{worker.terminate();await caches.delete(cacheName);}
  },workerUrl);
  reports.push({browser:name,...result});console.log('CACHE_PROBE',name,JSON.stringify(result));
  assert.deepEqual(result.fromWorker,{bytes:1024,last:71});assert.equal(result.detachedBytes,0,'Weight buffer must transfer, not copy');
  assert.equal(result.windowKeys.length,1);assert.equal(result.afterBytes,1024);assert.equal(result.afterLast,71,'Terminating inference must not lose model cache');
 }finally{await context.close();await browser.close();}
}}finally{await writeFile('test-report/cache-probe.json',JSON.stringify(reports,null,2));server.kill();}
