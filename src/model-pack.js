// Only Oc's bounded ZIP_STORED public model bundles. No arbitrary ZIP extraction,
// executable loading, archive-provided hashes, or photograph/label import here.
import { manifest, verifyBytes, saveVerifiedAsset } from './engine-assets.js?build=f0939ad64ecb';
import { checkCancelled } from './asset-download.js?build=f0939ad64ecb';
const decoder=new TextDecoder('utf-8',{fatal:true});
const fail=message=>{throw new Error('模型 ZIP 無效：'+message);};
export async function readStoredZip(file){
 if(!(file instanceof Blob)||file.size<22||file.size>80000000)fail('大小須介於 22 bytes 與 80 MB。');
 const tailStart=Math.max(0,file.size-65557),tail=new Uint8Array(await file.slice(tailStart).arrayBuffer()),view=new DataView(tail.buffer);
 let end=-1;
 for(let n=tail.length-22;n>=0;n--)if(view.getUint32(n,true)===0x06054b50&&n+22+view.getUint16(n+20,true)===tail.length){end=n;break;}
 if(end<0)fail('找不到完整結尾，請重新取得完整模型包。');
 const count=view.getUint16(end+10,true),cdBytes=view.getUint32(end+12,true),cdOffset=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count<1||count>20||cdBytes>20000||cdOffset+cdBytes!==tailStart+end)fail('不支援分卷、ZIP64 或異常目錄。');
 const central=new Uint8Array(await file.slice(cdOffset,cdOffset+cdBytes).arrayBuffer()),cv=new DataView(central.buffer),entries=new Map(),ranges=[];
 let position=0;
 for(let i=0;i<count;i++){
  if(position+46>central.length||cv.getUint32(position,true)!==0x02014b50)fail('目錄截斷。');
  const flags=cv.getUint16(position+8,true),method=cv.getUint16(position+10,true),size=cv.getUint32(position+24,true),compressed=cv.getUint32(position+20,true);
  const nameLength=cv.getUint16(position+28,true),extra=cv.getUint16(position+30,true),comment=cv.getUint16(position+32,true),offset=cv.getUint32(position+42,true);
  if((flags&~0x800)||method!==0||compressed!==size||size>50000000||cv.getUint16(position+34,true))fail('請使用提供的原始模型 ZIP，不要解壓後重新壓縮。');
  const next=position+46+nameLength+extra+comment;
  if(!nameLength||nameLength>256||next>central.length)fail('檔名或目錄長度無效。');
  const name=decoder.decode(central.subarray(position+46,position+46+nameLength));
  if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='..'||p==='.git')||entries.has(name))fail('重複或不安全的檔名。');
  if(offset+30>cdOffset)fail('檔案位置超出資料區。');
  const local=new DataView(await file.slice(offset,offset+30).arrayBuffer());
  if(local.getUint32(0,true)!==0x04034b50||local.getUint16(6,true)!==flags||local.getUint16(8,true)!==0||local.getUint32(18,true)!==size||local.getUint32(22,true)!==size)fail('檔案標頭不符。');
  const ln=local.getUint16(26,true),le=local.getUint16(28,true),dataOffset=offset+30+ln+le;
  if(ln!==nameLength||dataOffset+size>cdOffset||decoder.decode(await file.slice(offset+30,offset+30+ln).arrayBuffer())!==name)fail('檔案名稱或大小不符。');
  ranges.push([offset,dataOffset+size]);
  entries.set(name,{size,read:()=>file.slice(dataOffset,dataOffset+size).arrayBuffer()});position=next;
 }
 if(position!==central.length)fail('目錄含額外內容。');
 let previousEnd=0;
 for(const[start,end]of ranges.sort((a,b)=>a[0]-b[0])){if(start!==previousEnd)fail('檔案位置重疊或含額外內容。');previousEnd=end;}
 if(previousEnd!==cdOffset)fail('資料區不完整。');
 return entries;
}
export async function importModelPack(file,notify=()=>{},signal){
 checkCancelled(signal);notify('檢查模型包目錄…');
 const entries=await readStoredZip(file),metaEntry=entries.get('oc-model-pack.json');
 if(!metaEntry||metaEntry.size>10000)fail('缺少模型包清單。這不是教材或原始碼 ZIP。');
 const meta=JSON.parse(decoder.decode(await metaEntry.read())),catalog=await manifest(signal);
 if(meta.schema!==1||meta.kind!=='oc-public-model-pack'||meta.runtimeVersion!==catalog.runtimeVersion||!Array.isArray(meta.models)||meta.models.length<1||meta.models.length>3||new Set(meta.models).size!==meta.models.length||meta.models.some(id=>!Object.hasOwn(catalog.models,id)))fail('模型包版本或模型名稱不符。');
 const files=[...catalog.runtime,...meta.models.flatMap(id=>catalog.models[id].files)];
 const allowed=new Set([...files.map(f=>f.path),'oc-model-pack.json','README.txt','models/PaddleOCR-LICENSE','vendor/ort/LICENSE']);
 for(const[name,entry]of entries){if(!allowed.has(name))fail('不支援的內容：'+name);if(!files.some(f=>f.path===name)&&entry.size>30000)fail('說明檔過大。');}
 // Preflight the entire package, against the WEBSITE'S trusted catalog, before
 // writing anything. Invalid bundles cannot replace a working cached model.
 for(const asset of files){
  checkCancelled(signal);const entry=entries.get(asset.path);if(!entry||entry.size!==asset.bytes)fail('缺少或大小不符：'+asset.path);
  notify('驗證 '+asset.path);await verifyBytes(asset,await entry.read());
 }
 let saved=0;
 try{
  for(const asset of files){
   checkCancelled(signal);notify(`保存 ${saved+1} / ${files.length}：${asset.path}`);
   // Re-verify on write. Each transaction is complete before releasing its buffer.
   await saveVerifiedAsset(asset,await entries.get(asset.path).read(),signal);saved++;
  }
 }catch(cause){throw new Error(`模型包未全部安裝（已完成 ${saved} / ${files.length} 檔）：${cause.message||cause}。已完整保存的檔案保留，可再次匯入；原草稿不動。`,{cause});}
 notify(`已匯入 ${meta.models.length} 個模型與共用引擎，可以回掃描頁啟用。`);
 return {models:meta.models,files:saved};
}
