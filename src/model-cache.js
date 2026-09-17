// Public inference files only; independent from Oc drafts and StrForge storage.
// Commit bytes to IndexedDB before transferring a buffer to a disposable Worker.
export const MODEL_DB_NAME='oc-local-model-files-v1';
let opening;
function database(){
 if(opening)return opening;
 opening=new Promise((resolve,reject)=>{
  let request;try{request=indexedDB.open(MODEL_DB_NAME,1);}catch(error){reject(error);return;}
  let settled=false;
  const fail=error=>{if(!settled){settled=true;reject(error);}};
  request.onupgradeneeded=()=>request.result.createObjectStore('files');
  request.onblocked=()=>fail(new Error('模型保存區被另一個視窗占用；請關閉另一個 Oc 視窗。'));
  request.onerror=()=>fail(request.error||new Error('無法開啟模型保存區。'));
  request.onsuccess=()=>{
   const db=request.result;
   if(settled){db.close();return;}
   if(!db.objectStoreNames.contains('files')){db.close();fail(new Error('模型保存格式不正確，未清除資料。'));return;}
   settled=true;
   db.onversionchange=()=>{db.close();opening=null;};db.onclose=()=>{opening=null;};resolve(db);
  };
 }).catch(error=>{opening=null;throw error;});
 return opening;
}
function validKey(key){if(typeof key!=='string'||key.length>2048||!key.startsWith(new URL('../models/',import.meta.url).href))throw new Error('模型保存路徑無效。');}
async function execute(mode,action){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('files',mode);let value,request;
  tx.oncomplete=()=>resolve(value);
  tx.onerror=()=>reject(tx.error||request?.error||new Error('模型保存失敗。'));
  tx.onabort=()=>reject(tx.error||request?.error||new Error('模型保存已中止。'));
  try{request=action(tx.objectStore('files'));request.onsuccess=()=>{value=request.result;};}
  catch(error){tx.abort();reject(error);}
 });
}
export function readModelFile(key){validKey(key);return execute('readonly',store=>store.get(key));}
export function writeModelFile(key,bytes){
 validKey(key);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<1||bytes.byteLength>50000000)throw new Error('模型保存內容無效或過大。');
 return execute('readwrite',store=>store.put(bytes,key));
}
export function modelFileKeys(){return execute('readonly',store=>store.getAllKeys());}
export async function removeModelFiles(prefix){
 validKey(prefix);if(!prefix.endsWith('/'))throw new Error('必須指定單一模型目錄。');
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('files','readwrite'),store=tx.objectStore('files');let count=0;
  tx.oncomplete=()=>resolve(count);tx.onerror=()=>reject(tx.error||new Error('移除模型失敗。'));tx.onabort=()=>reject(tx.error||new Error('移除模型已中止。'));
  const cursor=store.openKeyCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;if(typeof item.key==='string'&&item.key.startsWith(prefix)){store.delete(item.key);count++;}item.continue();};
 });
}
