import { engineById } from './engines.js?build=f0939ad64ecb';
export function validRows(rows){
 if(!Array.isArray(rows)||rows.length>100||!rows.every(row=>row&&typeof row.id==='string'&&typeof row.value==='string'&&typeof row.thumbnail==='string'&&typeof row.raw==='string'&&typeof row.reason==='string'&&Array.isArray(row.predictions)&&row.predictions.every(p=>p&&Number.isFinite(p.score)&&Number.isFinite(p.margin)&&Array.isArray(p.candidates)&&p.candidates.every(c=>Number.isInteger(c.digit)&&c.digit>=0&&c.digit<=9))))return false;
 return rows.every(row=>row.formSlot===undefined)||(rows.length===30&&rows.every((row,index)=>row.formSlot===index+1));
}
export function restoreDraft(draft){
 if(!draft)return {runs:[],activeEngine:null,rows:[]};
 if(draft.schema!==1||!validRows(draft.rows))throw new Error('草稿格式無效或版本較新；不覆蓋未知資料。');
 if(draft.modelResults===undefined)return {runs:draft.rows.length?[{engine:'legacy',rows:draft.rows,status:'ready',elapsedMs:0}]:[],activeEngine:draft.rows.length?'legacy':null,rows:draft.rows};
 if(draft.resultsSchema!==1||!Array.isArray(draft.modelResults)||draft.modelResults.length>5||new Set(draft.modelResults.map(r=>r.engine)).size!==draft.modelResults.length)throw new Error('多模型草稿版本或結構不正確，資料保留。');
 for(const r of draft.modelResults)if(!r||(!engineById(r.engine)&&r.engine!=='legacy')||!['ready','error','cancelled'].includes(r.status)||!validRows(r.rows)||!Number.isFinite(r.elapsedMs)||r.elapsedMs<0||typeof(r.error??'')!=='string')throw new Error('多模型結果格式不正確，資料保留。');
 const active=draft.modelResults.find(r=>r.engine===draft.activeEngine&&r.status==='ready');
 if(draft.modelResults.some(r=>r.status==='ready')&&!active)throw new Error('找不到已選模型的校正草稿。');
 return {runs:draft.modelResults,activeEngine:active?.engine??null,rows:active?.rows??draft.rows};
}
export function snapshotDraft(rows,runs,activeEngine){
 const copy=structuredClone(runs);const current=copy.find(r=>r.engine===activeEngine);if(current)current.rows=structuredClone(rows);
 const result={schema:1,rows:structuredClone(rows),resultsSchema:1,activeEngine,modelResults:copy};restoreDraft(result);return result;
}
