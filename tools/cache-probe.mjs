import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(),context=await browser.newContext(),page=await context.newPage();
 try{
  await page.goto('http://127.0.0.1:4173/Oc/');
  const result=await page.evaluate(async()=>{
   const cacheName='oc-synthetic-cache-probe';
   const workerCode=`self.onmessage=async({data})=>{let result={available:typeof caches};try{const c=await caches.open(data.name);await c.put(data.url,new Response(new Uint8Array(1024),{headers:{'Content-Type':'application/octet-stream'}}));result.keys=(await c.keys()).map(r=>r.url);result.bytes=(await (await c.match(data.url)).arrayBuffer()).byteLength;}catch(e){result.error=e.name+': '+e.message;}self.postMessage(result);};`;
   const codeURL=URL.createObjectURL(new Blob([workerCode],{type:'text/javascript'}));
   const worker=new Worker(codeURL),url=new URL('models/synthetic-probe',location.href).href;
   try{
    const fromWorker=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Cache probe timed out')),10000);worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage({name:cacheName,url});});
    worker.terminate();
    const cache=await caches.open(cacheName),windowKeys=(await cache.keys()).map(r=>r.url);
    let windowPut;try{await cache.put(url+'-window',new Response(new Uint8Array(1024)));windowPut=(await cache.keys()).map(r=>r.url);}catch(e){windowPut=e.name+': '+e.message;}
    return{fromWorker,windowKeys,windowPut};
   }finally{worker.terminate();URL.revokeObjectURL(codeURL);await caches.delete(cacheName);}
  });
  console.log('CACHE_PROBE',name,JSON.stringify(result));
 }finally{await context.close();await browser.close();}
}}finally{server.kill();}
