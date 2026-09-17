// CI-only post-deployment readback; never imported by the PWA.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const revision=process.env.GITHUB_SHA;
assert.match(revision||'',/^[a-f0-9]{40}$/,'Use the exact main commit being checked');
const base='https://yang-00712.github.io/Oc/';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expectedIndex=hash(await readFile('index.html'));
let indexReady=false,lastError;
// Pages is deployed separately; wait only for the small index to catch up.
for(let attempt=0;attempt<6;attempt++){
 try{
  const url=new URL(base);url.searchParams.set('verify',revision);
  const r=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(20000)});
  assert.equal(r.status,200,'Published index HTTP status');
  assert.equal(hash(Buffer.from(await r.arrayBuffer())),expectedIndex,'Published index is not this commit yet');
  indexReady=true;break;
 }catch(error){lastError=error;if(attempt<5)await new Promise(resolve=>setTimeout(resolve,15000));}
}
if(!indexReady)throw lastError;
const results=[];
for(const name of ['Oc-Models.zip','Oc-PP-OCRv5-General.zip']){
 const expected=await readFile('downloads/'+name),url=new URL('downloads/'+name,base);
 const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(120000)});
 assert.equal(response.status,200,name+' HTTP status');
 const actual=Buffer.from(await response.arrayBuffer());
 assert.equal(actual.length,expected.length,name+' download length');
 assert.equal(hash(actual),hash(expected),name+' published SHA-256');
 results.push({name,url:url.href,bytes:actual.length,sha256:hash(actual),status:200});
}
await mkdir('test-report',{recursive:true});
await writeFile('test-report/published-models.json',JSON.stringify({revision,indexSha256:expectedIndex,downloads:results},null,2));
console.log('PUBLISHED_MODELS',JSON.stringify({revision,downloads:results}));
