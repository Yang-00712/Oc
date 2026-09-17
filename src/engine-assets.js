// Window owns verified model AND runtime storage. No photograph goes to a server.
import { readModelFile, writeModelFile, modelFileKeys, removeModelFiles } from './model-cache.js?build=6ac4ff17052f';
import { LOCAL_ASSETS } from './model-catalog.js?build=6ac4ff17052f';
import { checkCancelled, downloadAsset } from './asset-download.js?build=6ac4ff17052f';
const base=new URL('../',import.meta.url);
export const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export function assetUrl(asset){
 if(!asset||!/^(?:models\/ppocr-v[45]-(?:en|ch)\/(?:model\.onnx|config\.json)|vendor\/ort\/ort(?:\.wasm\.min\.mjs|-wasm-simd-threaded\.(?:mjs|wasm)))$/.test(asset.path)||!/^[a-f0-9]{64}$/.test(asset.sha256)||!Number.isInteger(asset.bytes)||asset.bytes<1||asset.bytes>50000000)throw new Error('模型檔案清單無效。');
 const url=new URL(asset.path,base);url.searchParams.set('content',asset.sha256);return url.href;
}
export async function manifest(signal){
 checkCancelled(signal);
 // Generated from the repository's pinned manifest. File imports and warm model
 // reads must not depend on a network request for this small catalog.
 const m=structuredClone(LOCAL_ASSETS);
 if(m.schema!==1||m.runtimeVersion!=='1.22.0'||m.runtime.length!==3)throw new Error('不支援的本機模型套件版本。');
 for(const item of [...m.runtime,...Object.values(m.models).flatMap(x=>x.files)])assetUrl(item);
 return m;
}
export async function verifyBytes(asset,bytes){
 assetUrl(asset);
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==asset.bytes||await sha(bytes)!==asset.sha256)throw new Error('模型檔案完整性不符：'+asset.path);
}
export async function saveVerifiedAsset(asset,bytes,signal){
 await verifyBytes(asset,bytes);checkCancelled(signal);
 try{
  await writeModelFile(assetUrl(asset),bytes);
  // A completed transaction and readback precede "installed" or Worker transfer.
  checkCancelled(signal);await verifyBytes(asset,await readModelFile(assetUrl(asset)));
 }catch(cause){
  if(signal?.aborted)throw signal.reason||cause;
  throw new Error(`保存失敗：${asset.path}：${cause.message||cause}。未回報安裝完成；校正草稿不受影響。`,{cause});
 }
}
export async function verifiedAsset(asset,notify=()=>{},signal,options={}){
 checkCancelled(signal);const url=assetUrl(asset);let cached,storageAvailable=true;
 try{cached=await readModelFile(url);}catch(cause){
  if(options.requireStored||options.storedOnly)throw new Error('無法讀取模型保存區：'+cause.message,{cause});
  storageAvailable=false;notify('無法保存模型，本次暫存使用；不會標示已安裝。');
 }
 checkCancelled(signal);
 if(cached!==undefined){
  try{await verifyBytes(asset,cached);}catch(cause){throw new Error('已存檔案完整性不符：'+asset.path+'。請重新匯入完整模型 ZIP；不用清草稿。',{cause});}
  notify('讀取已存檔案：'+asset.path);return cached;
 }
 if(options.storedOnly)throw new Error('尚未安裝：'+asset.path+'。請先下載保存或匯入模型 ZIP。');
 const bytes=await downloadAsset(url,asset,notify,signal);await verifyBytes(asset,bytes);checkCancelled(signal);
 if(storageAvailable){
  try{await saveVerifiedAsset(asset,bytes,signal);}catch(cause){if(options.requireStored||signal?.aborted)throw cause;notify(cause.message+' 本次僅暫存使用。');}
 }
 checkCancelled(signal);return bytes;
}
export async function prepareEngine(id,notify=()=>{},signal){
 const m=await manifest(signal),entry=m.models[id];if(!entry)throw new Error('未知模型。');
 // Preserve existing complete files after cancellation; never delete to retry.
 for(const file of [...m.runtime,...entry.files])await verifiedAsset(file,notify,signal,{requireStored:true});
 notify('已安裝模型與共用引擎；可以開始辨識。');
}
export async function loadEngineAssets(id,notify,signal){
 const m=await manifest(signal),entry=m.models[id];if(!entry||entry.files.length!==2)throw new Error('模型不在已驗證清單內。');
 const config=JSON.parse(new TextDecoder().decode(await verifiedAsset(entry.files.find(f=>f.path.endsWith('config.json')),notify,signal)));
 const item=entry.files.find(f=>f.path.endsWith('.onnx'));
 if(config.id!==id||config.schema!==1||config.modelSha256!==item.sha256||config.height!==48||config.width!==320||config.channels!=='BGR'||!Array.isArray(config.characters)||config.characters.length<10||config.characters.some(c=>typeof c!=='string'))throw new Error('模型字典或設定不相符。');
 const weights=await verifiedAsset(item,notify,signal),runtime={};
 for(const file of m.runtime)runtime[file.path.split('/').pop()]=await verifiedAsset(file,notify,signal);
 return {config,weights,modelHash:item.sha256,runtime,bytes:entry.bytes};
}
export async function modelStorage(){
 const m=await manifest(),keys=new Set(await modelFileKeys());
 const saved=files=>files.reduce((n,f)=>n+(keys.has(assetUrl(f))?f.bytes:0),0);
 const runtimeBytes=m.runtime.reduce((n,f)=>n+f.bytes,0),runtimeSaved=saved(m.runtime);
 return {items:Object.entries(m.models).map(([id,entry])=>({id,bytes:entry.bytes,saved:saved(entry.files),installed:saved(entry.files)===entry.bytes,ready:saved(entry.files)===entry.bytes&&runtimeSaved===runtimeBytes})),runtimeBytes,runtimeSaved,runtimeInstalled:runtimeSaved===runtimeBytes};
}
export async function clearModel(id){
 const m=await manifest(),entry=m.models[id];if(!entry)throw new Error('未知模型。');
 await removeModelFiles(new URL('models/'+id+'/',base).href);
}
