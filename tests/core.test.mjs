import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseTime, exportTimes, orderWarnings } from '../src/time.js';
import { loadModel, infer } from '../src/cnn.js';
import { segment, normalizeDigit } from '../src/segmentation.js';
import { zipFiles } from '../src/zip.js';

for(const [input,expected] of [['0000','00:00'],['0900','09:00'],['0910','09:10'],['1002','10:02'],['1004','10:04'],['2359','23:59'],['09:10','09:10']])test('time '+input,()=>assert.equal(parseTime(input).formatted,expected));
for(const value of ['2400','0968','9:00','900','09000','O900','-100','','09:000','<img>'])test('reject '+value,()=>assert.equal(parseTime(value).valid,false));
test('exports require explicit confirmation',()=>assert.throws(()=>exportTimes([{value:'0900',confirmed:false}]),/確認/));
test('exports reject an invalid but marked-confirmed row',()=>assert.throws(()=>exportTimes([{value:'0960',confirmed:true}]),/確認/));
test('leading zero and ordering preserved',()=>assert.equal(exportTimes([{value:'1004',confirmed:true},{value:'0900',confirmed:true}]),'10:04\r\n09:00\r\n'));
test('backwards time is a warning, not automatic repair',()=>assert.deepEqual(orderWarnings([{value:'1004'},{value:'0900'},{value:'0910'}]),[false,true,false]));
test('empty column does not invent digits',()=>assert.throws(()=>segment(new Uint8Array(40*100*4).fill(255),40,100),/未找到/));
test('row count bound',()=>assert.throws(()=>segment(new Uint8Array(40*100*4).fill(255),40,100,{rowCount:101}),/列數/));
test('fixed row mode preserves blank rows for manual correction',()=>{const rows=segment(new Uint8Array(40*100*4).fill(255),40,100,{rowCount:4});assert.equal(rows.length,4);assert.ok(rows.every(r=>r.glyphs.length===0&&r.uncertain));});
test('blank digit has a zero tensor',()=>assert.ok(normalizeDigit(new Uint8Array(100),10,null).every(n=>n===0)));
test('malformed model is rejected',()=>assert.throws(()=>loadModel({schema:9}),/模型/));
test('bad weights rejected',()=>assert.throws(()=>loadModel({schema:1,architecture:'conv8x5-pool2-conv16x5-pool2-fc10',weights:{}}),/參數/));
test('model hash matches its manifest',async()=>{const model=await readFile('models/time-digit.json'),config=JSON.parse(await readFile('models/model.json'));assert.equal(createHash('sha256').update(model).digest('hex'),config.sha256);assert.ok(model.length<1000000);});
test('JS CNN matches 32 independent PyTorch golden outputs',async()=>{
    const model=loadModel(JSON.parse(await readFile('models/time-digit.json'))),golden=JSON.parse(await readFile('tests/golden.json'));
    assert.equal(golden.length,32);let correct=0,max=0;
    for(const example of golden){const p=infer(example.pixels,model);p.logits.forEach((n,i)=>{max=Math.max(max,Math.abs(n-example.logits[i]));assert.ok(Math.abs(n-example.logits[i])<.0005);});correct+=p.digit===example.label;}
    console.log(JSON.stringify({paritySamples:golden.length,maxLogitDifference:max,correct}));
});
test('ZIP has valid signatures and UTF8 flag',async()=>{const bytes=new Uint8Array(await zipFiles([{name:'labels.json',data:'{"時間":"0900"}'}]).arrayBuffer()),view=new DataView(bytes.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);});
test('ZIP rejects traversal',()=>assert.throws(()=>zipFiles([{name:'../bad',data:'x'}]),/檔名/));
test('runtime has no remote service endpoints or bulk storage clearing',async()=>{for(const file of ['src/app.js','src/ocr-worker.js','src/store.js']){const text=await readFile(file,'utf8');assert.ok(!/localStorage\.clear|deleteDatabase|caches\.delete|https:\/\//.test(text));}});
test('model is not loaded by page entry',async()=>{const entry=await readFile('src/app.js','utf8');assert.ok(!/from ['"].*(?:cnn|segmentation|time-digit)/.test(entry));assert.match(entry,/new Worker/);});
