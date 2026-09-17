import { loadModel, infer } from './cnn.js?build=6ac4ff17052f';
import { segment } from './segmentation.js?build=6ac4ff17052f';
self.onmessage=async({data})=>{
    const {id,rgba,width,height,options}=data;
    try {
        self.postMessage({id,type:'progress',message:'準備小型數字模型…'});
        const configResponse=await fetch(new URL('../models/model.json',import.meta.url),{cache:'no-cache'});
        if(!configResponse.ok) throw new Error('模型設定下載失敗，仍可在校正頁手動輸入。');
        const config=await configResponse.json();
        if(config.schema!==1||!/^time-digit\.json$/.test(config.file)||! /^[a-f0-9]{64}$/.test(config.sha256)) throw new Error('模型版本設定無效。');
        const url=new URL('../models/'+config.file,import.meta.url);url.searchParams.set('content',config.sha256);
        const response=await fetch(url);
        if(!response.ok) throw new Error(`模型下載失敗（HTTP ${response.status}）。`);
        const raw=await response.arrayBuffer();
        if(raw.byteLength>1000000) throw new Error('模型超過 1 MB 安全上限。');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==config.sha256) throw new Error('模型完整性不符；請重新載入後再試，不會清除資料。');
        const weights=loadModel(JSON.parse(new TextDecoder().decode(raw)));
        const pieces=segment(rgba,width,height,options),rows=[];
        for(let i=0;i<pieces.length;i++) {
            const piece=pieces[i],predictions=piece.glyphs.map(g=>infer(g,weights));
            rows.push({box:piece.box,raw:predictions.map(p=>p.digit).join(''),predictions:predictions.map(({logits,...p})=>p),glyphs:piece.glyphs,uncertain:piece.uncertain,reason:piece.reason,modelHash:hash});
            self.postMessage({id,type:'progress',message:`辨識第 ${i+1} / ${pieces.length} 列`});
        }
        self.postMessage({id,type:'result',rows});
    } catch(error) {self.postMessage({id,type:'error',message:String(error.message||error)});}
};
