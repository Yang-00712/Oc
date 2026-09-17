// Exercise a same-origin worker under the production CSP; never relax worker-src.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});
const reports=[];
const workerCode=`self.onmessage=async({data})=>{let result={available:typeof caches};try{const c=await caches.open(data.name);await c.put(data.url,new Response(new Uint8Array(1024),{headers:{'Content-Type':'application/octet-stream'}}));result.keys=(await c.keys()).map(r=>r.url);result.bytes=(await (await c.match(data.url)).arrayBuffer()).byteLength;}catch(e){result.error=e.name+': '+e.message;}self.postMessage(result);};`;
try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(),context=await browser.newContext(),page=await context.newPage();
 const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 try{
  const workerUrl='http://127.0.0.1:4173/Oc/tests/cache-probe-worker.js';
  await context.route(workerUrl,route=>route.fulfill({status:200,contentType:'text/javascript',body:workerCode}));
  await page.goto('http://127.0.0.1:4173/Oc/');
  const result=await page.evaluate(async workerUrl=>{
   const cacheName='oc-synthetic-cache-probe',url=new URL('models/synthetic-probe',location.href).href;
   const worker=new Worker(workerUrl);
   try{
    const fromWorker=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Cache probe timed out')),10000);worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message||'Same-origin cache worker failed'));};worker.postMessage({name:cacheName,url});});
    worker.terminate();
    const cache=await caches.open(cacheName),windowKeys=(await cache.keys()).map(r=>r.url);
    let windowPut;try{await cache.put(url+'-window',new Response(new Uint8Array(1024)));windowPut=(await cache.keys()).map(r=>r.url);}catch(e){windowPut=e.name+': '+e.message;}
    return{fromWorker,windowKeys,windowPut};
   }finally{worker.terminate();await caches.delete(cacheName);}
  },workerUrl);
  reports.push({browser:name,...result,consoleErrors});
  console.log('CACHE_PROBE',name,JSON.stringify(result));
  assert.equal(result.fromWorker.bytes,1024,'Worker Cache API must save and read the exact bytes');
  assert.equal(result.windowKeys.length,1,'Window must observe the completed worker cache write');
  assert.equal(result.windowPut.length,2,'Window cache write must retain the worker entry');
 }finally{await context.close();await browser.close();}
}}finally{await writeFile('test-report/cache-probe.json',JSON.stringify(reports,null,2));server.kill();}
