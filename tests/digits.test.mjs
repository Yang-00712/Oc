import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeCTC} from '../src/paddle.js';
import {parseTime,exportTimes} from '../src/time.js';
import {restoreDraft,snapshotDraft} from '../src/multi-state.js';

const characters=['',...'0123456789','O','I',':','/','中','０','²'];
function tensor(frames,chars=characters){
 const data=new Float32Array(frames.length*chars.length);
 for(let t=0;t<frames.length;t++)for(const [char,score] of Object.entries(frames[t])){
  const c=chars.indexOf(char);assert.ok(c>=0,'Known fixture character: '+char);data[t*chars.length+c]=score;
 }
 return {data,dims:[1,frames.length,chars.length]};
}
function digits(frames,chars=characters){const {data,dims}=tensor(frames,chars);return decodeCTC(data,dims,chars,{digitsOnly:true});}
function frameText(text){return [...text].flatMap(char=>[{[char]:1},{'':1}]);}
const row=(value,extra={})=>({id:'row',value,raw:value,thumbnail:'',reason:'',predictions:[],confirmed:false,...extra});

test('restrict candidates before argmax, not by deleting non-digits from text',()=>{
 const frames=[{O:.7,'0':.25,'':.05},...frameText('900')];
 const {data,dims}=tensor(frames),before=Float32Array.from(data);
 assert.equal(decodeCTC(data,dims,characters).raw,'O900');
 const result=decodeCTC(data,dims,characters,{digitsOnly:true});
 assert.equal(result.raw,'0900');assert.equal(result.unrestrictedRaw,'O900');
 assert.equal(result.restrictedFrames,1);assert.equal(result.minimumScore,.25);
 assert.deepEqual(data,before,'Decoder must not mutate model scores');
});
test('numeric restriction retains original low score without renormalizing it',()=>{
 const r=digits([{I:.99,'7':.009,'':.001}]);
 assert.equal(r.raw,'7');assert.ok(r.score<.01);assert.ok(r.minimumScore<.01);assert.equal(r.unrestrictedRaw,'I');
});
test('letters are not mapped by O->0/I->1 substitution',()=>{
 const r=digits([{O:.8,'6':.15,'0':.01,'':.001},{'':1},{I:.8,'7':.15,'1':.01,'':.001}]);
 assert.equal(r.raw,'67');assert.equal(r.unrestrictedRaw,'OI');
});
test('blank remains an allowed candidate even when it beats every digit',()=>{
 const r=digits([{O:.8,'':.15,'0':.05}]);assert.equal(r.raw,'');assert.equal(r.unrestrictedRaw,'O');assert.equal(r.score,0);
});
test('adjacent tokens collapse but repeated zeros separated by blank survive',()=>{
 const r=digits([{'0':1},{'0':1},{'':1},{'9':1},{'':1},{'0':1},{'':1},{'0':1}]);assert.equal(r.raw,'0900');
});
for(const text of ['0000','0910','1002','1111','2359'])test('digits preserve exact string '+text,()=>{
 const r=digits(frameText(text));assert.equal(r.raw,text);assert.equal(r.unrestrictedRaw,text);assert.equal(r.restrictedFrames,0);
});
test('empty or all-blank output does not invent a time',()=>{
 assert.equal(digits([]).raw,'');assert.equal(digits([{'':1},{'':1}]).raw,'');
});
test('fullwidth digits, CJK and punctuation are not emitted or converted',()=>{
 assert.equal(digits([{':':.8,'':.2},{'/':.8,'':.2},{'中':.8,'':.2},{'０':.8,'':.2},{'²':.8,'':.2}]).raw,'');
});
test('does not pad, truncate or repair invalid HHMM',()=>{
 for(const text of ['900','090012','0968','2400']){
  assert.equal(digits(frameText(text)).raw,text);assert.equal(parseTime(text).valid,false);
  assert.throws(()=>exportTimes([row(text,{confirmed:true})]),/無效時間/);
 }
});
test('numeric-looking output still needs human confirmation before export',()=>{
 const r=row(digits(frameText('0900')).raw);assert.throws(()=>exportTimes([r]),/確認/);
 r.confirmed=true;assert.equal(exportTimes([r]),'09:00\r\n');
 assert.equal(exportTimes([r],'csv'),'\ufeff"行號","時間"\r\n"1","09:00"\r\n');
});
test('numeric whitelist requires each digit once and blank at the original index',()=>{
 const check=chars=>decodeCTC(new Float32Array(chars.length),[1,1,chars.length],chars,{digitsOnly:true});
 assert.throws(()=>check(['','0']),/完整 0–9/);
 assert.throws(()=>check([...characters,'0']),/重複/);
 assert.throws(()=>check(['blank',...characters.slice(1)]),/空白標記/);
});
test('nonfinite scores in excluded classes are still rejected',()=>{
 const {data,dims}=tensor([{'0':1}]);data[characters.indexOf('O')]=NaN;
 assert.throws(()=>decodeCTC(data,dims,characters,{digitsOnly:true}),/有限/);
 data[characters.indexOf('O')]=Infinity;assert.throws(()=>decodeCTC(data,dims,characters,{digitsOnly:true}),/有限/);
});
test('malformed shape cannot silently decode as valid digits',()=>{
 const {data}=tensor([{'0':1}]);for(const dims of [[2,1,characters.length],[1,-1,characters.length],[1,.5,characters.length],[1,1,characters.length-1]])assert.throws(()=>decodeCTC(data,dims,characters,{digitsOnly:true}),/字典/);
});
for(const id of ['ppocr-v5-en','ppocr-v5-ch','ppocr-v4-en'])test('actual '+id+' dictionary retains correct numeric class indices',async()=>{
 const config=JSON.parse(await readFile('models/'+id+'/config.json'));
 const r=digits(frameText('0900'),config.characters);assert.equal(r.raw,'0900');assert.equal(r.restrictedFrames,0);
});
test('old English/symbol results are preserved, not silently rewritten',()=>{
 const old={schema:1,rows:[row('O90:0',{confirmed:false})]};
 const snapshot=JSON.stringify(old);assert.equal(restoreDraft(old).rows[0].value,'O90:0');assert.equal(JSON.stringify(old),snapshot);
});
test('numeric raw, unrestricted transcript and per-model edits survive save/reload independently',()=>{
 const a=row('0900',{transcript:'O900',numericOnly:true}),b=row('0910',{transcript:'09I0',numericOnly:true});
 const runs=[{engine:'ppocr-v5-en',rows:[a],status:'ready',elapsedMs:1},{engine:'ppocr-v5-ch',rows:[b],status:'ready',elapsedMs:2}];
 a.value='0905';const restored=restoreDraft(snapshotDraft([a],runs,'ppocr-v5-en'));
 assert.equal(restored.rows[0].value,'0905');assert.equal(restored.rows[0].raw,'0900');assert.equal(restored.rows[0].transcript,'O900');assert.equal(restored.rows[0].numericOnly,true);
 assert.equal(restored.runs[1].rows[0].value,'0910');assert.equal(restored.runs[1].rows[0].transcript,'09I0');
});
