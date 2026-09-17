import test from 'node:test';import assert from 'node:assert/strict';
import {selectedEngines,normalizedTranscript,comparisonStats} from '../src/engines.js';
import {snapshotDraft,restoreDraft} from '../src/multi-state.js';
import {decodeCTC,prepareLine} from '../src/paddle.js';
import{segment}from'../src/segmentation.js';
const row=(value='0900')=>({id:'row',value,raw:value,confirmed:false,thumbnail:'',reason:'',predictions:[]});
test('only known, nonduplicate model choices',()=>{assert.equal(selectedEngines(['cnn','ppocr-v5-en','ppocr-v5-ch']).length,3);for(const v of [[],['bad'],['cnn','cnn'],null])assert.throws(()=>selectedEngines(v));});
test('whitespace may format time, but no digits may be guessed or removed',()=>{assert.equal(normalizedTranscript('0 9 0 0'),'0900');assert.equal(normalizedTranscript('O900'),'O900');assert.equal(normalizedTranscript('090012'),'090012');assert.equal(normalizedTranscript('09 10\n10 02'),'09 10\n10 02');});
test('legacy schema 1 draft is retained',()=>{const data=restoreDraft({schema:1,rows:[row()]});assert.equal(data.activeEngine,'legacy');assert.equal(data.rows[0].value,'0900');});
test('per-model changes do not overwrite another model or its raw value',()=>{
 const a=[row()],b=[row('0910')],runs=[{engine:'cnn',status:'ready',elapsedMs:1,rows:a},{engine:'ppocr-v5-en',status:'ready',elapsedMs:2,rows:b}];
 a[0].value='0905';const draft=snapshotDraft(a,runs,'cnn');a[0].value='0955';const restored=restoreDraft(draft);
 assert.equal(restored.rows[0].value,'0905');assert.equal(restored.rows[0].raw,'0900');assert.equal(restored.runs[1].rows[0].value,'0910');
});
test('failure of one model preserves ready model results',()=>{const runs=[{engine:'cnn',status:'ready',elapsedMs:1,rows:[row()]},{engine:'ppocr-v5-en',status:'error',elapsedMs:2,error:'offline',rows:[]}];assert.equal(restoreDraft(snapshotDraft(runs[0].rows,runs,'cnn')).rows[0].value,'0900');});
test('unknown or corrupt result schemas are not overwritten',()=>{for(const draft of [{schema:2,rows:[]},{schema:1,rows:[row()],resultsSchema:99,modelResults:[]},{schema:1,rows:[],resultsSchema:1,modelResults:[{engine:'cnn',status:'ready',elapsedMs:1,rows:[]}],activeEngine:'no'}])assert.throws(()=>restoreDraft(draft));});
test('corrected-row count is not a confidence or accuracy estimate',()=>{assert.deepEqual(comparisonStats([row(),{...row(),value:'0905',confirmed:true}]),{total:2,confirmed:1,edited:1});});
test('CTC collapses adjacent tokens, not zeros separated by blanks',()=>{
 const chars=['','0','9','1'],tokens=[1,1,0,2,0,1,0,1],data=new Float32Array(tokens.length*4);tokens.forEach((v,i)=>data[i*4+v]=1);
 assert.equal(decodeCTC(data,[1,tokens.length,4],chars).raw,'0900');
 assert.throws(()=>decodeCTC(data,[1,tokens.length,3],chars),/字典/);
});
test('CTC keeps letters instead of forcing digit guesses',()=>{assert.equal(decodeCTC(new Float32Array([0,1]),[1,1,2],['','O']).raw,'O');assert.throws(()=>decodeCTC(new Float32Array([NaN,1]),[1,1,2],['','0']),/有限/);});
test('preprocessing uses BGR, normalized CHW and zero padding',()=>{
 const rgba=new Uint8Array(4*4*4);for(let i=0;i<16;i++)rgba.set([255,128,0,255],i*4);
 const p=prepareLine(rgba,4,4,{x:0,y:0,width:4,height:4},{height:48,width:320});
 assert.deepEqual(p.dims,[1,3,48,320]);assert.equal(p.data[0],-1);assert.equal(p.data[2*48*320],1);assert.equal(p.data[100],0);
});
test('uneven rows in shadow are not equally sliced together',()=>{
 const w=110,h=280,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=240-Math.floor(y*.3);data.set([v,v,v,255],(y*w+x)*4);}
 for(const y0 of [20,80,190])for(let y=y0;y<y0+24;y++)for(let d=0;d<4;d++)for(let x=15+d*20;x<23+d*20;x++)data.set([20,20,20,255],(y*w+x)*4);
 const rows=segment(data,w,h);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.box.height<35));assert.equal(segment(data,w,h,{rowCount:3}).length,3);assert.throws(()=>segment(data,w,h,{rowCount:4}),/不同/);
});

import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
test('all pretrained model and runtime files match their exact hashes',async()=>{const m=JSON.parse(await readFile('models/local-engines.json'));for(const f of [...m.runtime,...Object.values(m.models).flatMap(e=>e.files)]){const data=await readFile(f.path);assert.equal(data.length,f.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);}});
