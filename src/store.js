// Only this database belongs to Oc. Do not enumerate, clear or modify other apps' storage.
export const DB_NAME='oc-time-v1';
let opening;
function database(){
    if(!opening) opening=new Promise((resolve,reject)=>{
        const request=indexedDB.open(DB_NAME,1);
        request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('state');db.createObjectStore('samples',{keyPath:'id'});};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
        request.onerror=()=>{opening=null;reject(request.error||new Error('本機儲存無法開啟。'));};
        request.onblocked=()=>{opening=null;reject(new Error('本機儲存被另一個視窗占用，請關閉另一個 Oc 視窗後重試。'));};
    });
    return opening;
}
async function execute(store,mode,action){
    const db=await database();
    return new Promise((resolve,reject)=>{
        const tx=db.transaction(store,mode);let value;
        const request=action(tx.objectStore(store));
        request.onsuccess=()=>{value=request.result;};
        tx.oncomplete=()=>resolve(value);
        tx.onerror=()=>reject(tx.error||request.error||new Error('保存失敗。'));
        tx.onabort=()=>reject(tx.error||request.error||new Error('保存已中止。'));
    });
}
export const getState=key=>execute('state','readonly',store=>store.get(key));
export const setState=(key,value)=>execute('state','readwrite',store=>store.put(value,key));
export const deleteSample=id=>execute('samples','readwrite',store=>store.delete(id));
export const allSamples=()=>execute('samples','readonly',store=>store.getAll());
export async function saveSample(sample){
    const db=await database();
    return new Promise((resolve,reject)=>{
        const tx=db.transaction('samples','readwrite'),store=tx.objectStore('samples');
        const count=store.count();let reason;
        count.onsuccess=()=>{
            const get=store.get(sample.id);
            get.onsuccess=()=>{
                if(count.result>=2000&&!get.result){reason=new Error('教材已滿 2,000 列。先匯出，再由設定清除教材。');tx.abort();}
                else store.put(sample);
            };
        };
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(reason||tx.error||new Error('教材保存失敗。'));
        tx.onabort=()=>reject(reason||tx.error||new Error('教材保存已中止。'));
    });
}
export async function metrics(){
    const [draft,samples,template]=await Promise.all([getState('draft'),allSamples(),getState('template')]);
    return {samples:samples.length,rows:draft?.rows?.length||0,bytes:new TextEncoder().encode(JSON.stringify({draft,samples,template})).length};
}
export const clearSamples=()=>execute('samples','readwrite',store=>store.clear());
export const clearDraft=()=>execute('state','readwrite',store=>store.delete('draft'));
