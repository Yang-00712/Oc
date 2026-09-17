// Window owns the public model cache; weights are transferred to disposable Workers.
// Do not depend on WebKit sharing Worker CacheStorage with the parent window.
// Never enumerate/delete unrelated site storage.
export const CACHE_NAME='oc-local-model-files-v1';
const base=new URL('../',import.meta.url);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function assetUrl(asset){
 if(!asset||! /^(?:models\/ppocr-v[45]-(?:en|ch)\/(?:model\.onnx|config\.json)|vendor\/ort\/[a-z0-9.-]+)$/.test(asset.path)||! /^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>50000000)throw new Error('模型檔案清單無效。');
 const url=new URL(asset.path,base);url.searchParams.set('content',asset.sha256);return url.href;
}
const checkCancelled=signal=>{if(signal?.aborted)throw signal.reason||new Error('模型下載已取消。');};
export async function manifest(signal){
 checkCancelled(signal);
 const r=await fetch(new URL('models/local-engines.json',base),{cache:'no-cache',signal});
 if(!r.ok)throw new Error('本機模型套件尚未備齊（HTTP '+r.status+'）。可先使用小型 CNN。');
 const m=await r.json();if(m.schema!==1||m.runtimeVersion!=='1.22.0'||!Array.isArray(m.runtime)||!m.models)throw new Error('不支援的本機模型套件版本。');
 for(const item of [...m.runtime,...Object.values(m.models).flatMap(x=>x.files)])assetUrl(item);
 return m;
}
export async function verifiedAsset(asset,notify=()=>{},signal){
 checkCancelled(signal);
 const url=assetUrl(asset);let cache,cached;
 try{cache=await caches.open(CACHE_NAME);cached=await cache.match(url);}catch{notify('此瀏覽器無法保存模型快取；本次仍可辨識。');}
 checkCancelled(signal);
 if(cached){const bytes=await cached.arrayBuffer();if(bytes.byteLength===asset.bytes&&await sha(bytes)===asset.sha256)return bytes;throw new Error('已下載模型完整性不符；請只移除此模型快取後重新下載，草稿不受影響。');}
 notify(`下載 ${asset.path.split('/').slice(-2).join('/')} · ${(asset.bytes/1048576).toFixed(1)} MB`);
 const r=await fetch(url,{credentials:'same-origin',signal});
 if(!r.ok)throw new Error(`模型下載 HTTP ${r.status}：${asset.path}`);
 const bytes=await r.arrayBuffer();
 if(bytes.byteLength!==asset.bytes||await sha(bytes)!==asset.sha256)throw new Error('模型下載完整性不符：'+asset.path);
 checkCancelled(signal);
 if(cache)try{await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}}));}catch{notify('模型已下載，但空間不足無法快取；結果仍可保存。');}
 checkCancelled(signal);
 return bytes;
}
export async function loadEngineAssets(id,notify,signal){
 const m=await manifest(signal),entry=m.models[id];if(!entry||entry.files.length!==2)throw new Error('模型不在已驗證清單內。');
 const config=JSON.parse(new TextDecoder().decode(await verifiedAsset(entry.files.find(f=>f.path.endsWith('config.json')),notify,signal)));
 const item=entry.files.find(f=>f.path.endsWith('.onnx'));
 if(config.id!==id||config.schema!==1||config.modelSha256!==item.sha256||config.height!==48||config.width!==320||config.channels!=='BGR'||!Array.isArray(config.characters)||config.characters.length<10||config.characters.some(c=>typeof c!=='string'))throw new Error('模型字典或設定不相符。');
 const weights=await verifiedAsset(item,notify,signal);
 // ORT's own module loader uses same-origin content-addressed URLs; no fetch override.
 const main=m.runtime.find(f=>f.path.endsWith('ort.wasm.min.mjs'));
 const glue=m.runtime.find(f=>f.path.endsWith('ort-wasm-simd-threaded.mjs'));
 const binary=m.runtime.find(f=>f.path.endsWith('ort-wasm-simd-threaded.wasm'));
 return {config,weights,modelHash:item.sha256,mainUrl:assetUrl(main),glueUrl:assetUrl(glue),wasmUrl:assetUrl(binary),bytes:entry.bytes};
}
export async function modelStorage(){
 const m=await manifest();const cache=await caches.open(CACHE_NAME),items=[];
 for(const [id,entry] of Object.entries(m.models)){
  let saved=0;for(const file of entry.files){if(await cache.match(assetUrl(file)))saved+=file.bytes;}
  items.push({id,bytes:entry.bytes,saved,installed:saved===entry.bytes});
 }
 return {items,runtimeBytes:m.runtime.reduce((n,f)=>n+f.bytes,0)};
}
export async function clearModel(id){
 const m=await manifest(),entry=m.models[id];if(!entry)throw new Error('未知模型。');
 const cache=await caches.open(CACHE_NAME);
 // Delete only this engine's entries, including previous content hashes.
 for(const req of await cache.keys()){const u=new URL(req.url);if(u.origin===base.origin&&u.pathname.startsWith(new URL('models/'+id+'/',base).pathname))await cache.delete(req);}
}
