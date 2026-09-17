import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {zipFiles} from '../src/zip.js';
import {readStoredZip,importModelPack} from '../src/model-pack.js';
import {manifest,assetUrl,verifyBytes} from '../src/engine-assets.js';
import {downloadAsset,withAssetBudget,ASSET_DOWNLOAD_LIMIT_MS} from '../src/asset-download.js';
const bundle=async files=>zipFiles(files.map(([name,data])=>({name,data})));

test('pinned catalog works without a manifest network request',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});
 const m=await manifest();assert.equal(Object.keys(m.models).length,3);assert.equal(m.runtime.length,3);
 assert.deepEqual(m,JSON.parse(await readFile('models/local-engines.json')));
});
test('catalog rejects untrusted paths and oversized assets',()=>{
 for(const path of ['https://evil.invalid/model.onnx','../main.js','vendor/ort/custom.mjs','models/evil/model.onnx'])assert.throws(()=>assetUrl({path,bytes:1,sha256:'0'.repeat(64)}));
 assert.throws(()=>assetUrl({path:'models/ppocr-v5-ch/model.onnx',bytes:60000000,sha256:'0'.repeat(64)}));
});
test('runtime bytes are verified, not just model weights',async()=>{
 const m=await manifest();for(const asset of m.runtime){const b=await readFile(asset.path);await verifyBytes(asset,new Uint8Array(b).buffer);}
 const bad=new Uint8Array(m.runtime[0].bytes);await assert.rejects(verifyBytes(m.runtime[0],bad.buffer),/完整性/);
});
test('stored ZIP reads exact bounded entries, including UTF8 contents',async()=>{
 const entries=await readStoredZip(await bundle([['README.txt','模型包'],['model.onnx','abc']]));
 assert.equal(entries.size,2);assert.equal(new TextDecoder().decode(await entries.get('README.txt').read()),'模型包');
});
test('truncated and non ZIP bundles fail before import',async()=>{
 for(const b of [new Blob(['no zip']),new Blob([new Uint8Array(100)])])await assert.rejects(readStoredZip(b),/模型 ZIP 無效/);
 const valid=await bundle([['one','two']]);await assert.rejects(readStoredZip(valid.slice(0,-1)),/結尾/);
});
test('duplicate file names cannot shadow validated bytes',async()=>{
 await assert.rejects(readStoredZip(await bundle([['one','first'],['one','second']])),/重複/);
});
test('encrypted or compressed ZIP files are rejected instead of allocating unbounded output',async()=>{
 for(const mode of ['flags','method']){
  const data=new Uint8Array(await (await bundle([['model','bytes']])).arrayBuffer()),v=new DataView(data.buffer);
  const cd=v.getUint32(data.length-22+16,true);v.setUint16(cd+(mode==='flags'?8:10),1,true);
  await assert.rejects(readStoredZip(new Blob([data])),/不要解壓/);
 }
});
test('central/local path mismatch and overlap fail',async()=>{
 const data=new Uint8Array(await (await bundle([['model','bytes']])).arrayBuffer()),v=new DataView(data.buffer),cd=v.getUint32(data.length-22+16,true);
 data[30]='X'.charCodeAt(0);await assert.rejects(readStoredZip(new Blob([data])),/名稱/);
 data[30]='m'.charCodeAt(0);v.setUint32(cd+42,1,true);await assert.rejects(readStoredZip(new Blob([data])),/標頭/);
});
test('source or training ZIP is not treated as a model installer',async()=>{
 await assert.rejects(importModelPack(await bundle([['labels.json','{}']])),/不是教材或原始碼/);
});
test('unknown model IDs are rejected before model storage is opened',async t=>{
 let calls=0;const original=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open(){calls++;throw Error('Storage must not open');}}});t.after(()=>{if(original)Object.defineProperty(globalThis,'indexedDB',original);else delete globalThis.indexedDB;});
 const meta=JSON.stringify({schema:1,kind:'oc-public-model-pack',runtimeVersion:'1.22.0',models:['bad']});
 await assert.rejects(importModelPack(await bundle([['oc-model-pack.json',meta]])),/模型名稱/);assert.equal(calls,0);
});
test('streaming progress reports actual decoded bytes rather than Content-Length',async t=>{
 const messages=[];t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3]));c.close();}}),{headers:{'Content-Length':'1'}}));
 const bytes=await downloadAsset('http://example.invalid',{path:'models/test/model.onnx',bytes:3},m=>messages.push(m));
 assert.deepEqual([...new Uint8Array(bytes)],[1,2,3]);assert.ok(messages.some(m=>m.includes('100%')));
});
test('Load failed includes file name, received size and no automatic retry',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new TypeError('Load failed');});
 await assert.rejects(downloadAsset('http://example.invalid',{path:'vendor/ort/ort-wasm-simd-threaded.wasm',bytes:100}),/ort-wasm-simd-threaded.wasm.*Load failed/);assert.equal(calls,1);
});
test('HTTP and incomplete bodies are not marked installed',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('x',{status:404}));
 await assert.rejects(downloadAsset('http://example.invalid',{path:'m.onnx',bytes:2}),/HTTP 404/);
 globalThis.fetch=async()=>new Response(new Uint8Array([1]));
 await assert.rejects(downloadAsset('http://example.invalid',{path:'m.onnx',bytes:2}),/未下載完整/);
});
test('oversized stream stops without writing or retry',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array([1,2,3])));
 await assert.rejects(downloadAsset('http://example.invalid',{path:'m.onnx',bytes:2}),/超出宣告/);
});
test('preparation budget is independent of the four-minute inference budget',()=>{assert.equal(ASSET_DOWNLOAD_LIMIT_MS,900000);});
test('manual cancel releases a fetch that ignores abort without launching another request',async()=>{
 const c=new AbortController();let calls=0;
 const p=withAssetBudget(()=>{calls++;return new Promise(()=>{});},c);await Promise.resolve();c.abort(Error('manual cancel'));
 await assert.rejects(p,/manual cancel/);assert.equal(calls,1);
});
test('bounded preparation expiry stops waiting, never loops or retries',async()=>{
 let calls=0;await assert.rejects(withAssetBudget(()=>{calls++;return new Promise(()=>{});},new AbortController(),5),/準備已達/);assert.equal(calls,1);
});
test('inference timeout is set after asset preparation and runtime buffers transfer',async()=>{
 const s=await readFile('src/app.js','utf8');
 assert.ok(s.indexOf("timer=setTimeout(()=>finish(null,'模型已準備")>s.indexOf('assets=await withAssetBudget'));
 assert.match(s,/transfers.push\(assets.weights,\.\.\.Object.values\(assets.runtime\)\)/);
});
