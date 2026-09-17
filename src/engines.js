// A catalog is not a runtime import. No model is fetched on page startup.
export const ENGINES=Object.freeze([
 {id:'cnn',name:'Oc 小型數字 CNN',description:'原有模型；單字辨識對照，63 KB。',kind:'digits'},
 {id:'ppocr-v5-en',name:'PP-OCRv5 英文／數字',description:'預訓練整列模型；下載大小以安裝畫面為準。',kind:'line'},
 {id:'ppocr-v5-ch',name:'PP-OCRv5 通用',description:'預訓練中英日整列模型；可與英文版獨立比較。',kind:'line'},
 {id:'ppocr-v4-en',name:'PP-OCRv4 英文／數字',description:'另一版預訓練權重，作為獨立對照。',kind:'line'}
]);
export const engineById=id=>ENGINES.find(engine=>engine.id===id);
export function selectedEngines(ids){
 if(!Array.isArray(ids)||ids.length<1||ids.length>ENGINES.length||new Set(ids).size!==ids.length||ids.some(id=>!engineById(id)))throw new Error('請至少勾選一個已支援的本機模型。');
 return ids.map(engineById);
}
export function normalizedTranscript(raw){
 const text=String(raw??'').trim();
 // Formatting whitespace only. Never turn O into 0, invent digits, or reorder lines.
 const compact=text.replace(/\s/g,'');
 return /^\d{2}:?\d{2}$/.test(compact)?compact:text;
}
export function comparisonStats(rows){
 return {total:rows.length,confirmed:rows.filter(r=>r.confirmed).length,edited:rows.filter(r=>normalizedTranscript(r.raw).replace(':','')!==String(r.value).replace(':','')).length};
}
