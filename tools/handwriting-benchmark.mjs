// Synthetic photographed-form benchmark; never reads user files or trains a model.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {makeForm,scenarios} from '../tests/handwriting-fixtures.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const server=spawn(process.execPath,['tools/serve.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
await mkdir('test-report',{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage(),reports=[];
try{
 await page.goto('http://127.0.0.1:4173/Oc/');
 const result=await page.evaluate(async forms=>{
  const {segment}=await import('./src/segmentation.js'),{prepareLine,decodeCTC}=await import('./src/paddle.js'),{loadEngineAssets}=await import('./src/engine-assets.js');
  const assets=await loadEngineAssets('ppocr-v5-ch',()=>{});
  const ort=await import('./vendor/ort/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths=new URL('./vendor/ort/',location.href).href;
  const session=await ort.InferenceSession.create(assets.weights,{executionProviders:['wasm'],graphOptimizationLevel:'all'}),reports=[];
  const distance=(a,b)=>{let d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,d[j]+1,d[j-1]+Number(a[i-1]!==b[j-1]));d=next;}return d[b.length];};
  try{
   for(const form of forms){
    const url=URL.createObjectURL(new Blob([form.svg],{type:'image/svg+xml'})),image=new Image();image.src=url;await image.decode();
    const sheet=document.createElement('canvas');sheet.width=640;sheet.height=1280;sheet.getContext('2d').drawImage(image,0,0);URL.revokeObjectURL(url);
    const {x,y,width,height}=form.roi,rgba=sheet.getContext('2d').getImageData(x,y,width,height).data,pieces=segment(rgba,width,height,{rowMode:'grid30'});
    const report={scenario:form.scenario,slots:pieces.length,png:sheet.toDataURL('image/png').split(',')[1],methods:[]};
    for(const method of ['current','padded','cell','contrast']){
     const rows=[],started=performance.now();
     for(let i=0;i<pieces.length;i++){
      const piece=pieces[i],inner={x:piece.box.x,y:piece.box.y+3,width:piece.box.width,height:piece.box.height-6};
      let box=piece.lineBox||inner,pixels=rgba,w=width,h=height;
      if(method==='padded'){
       const pad=Math.max(3,Math.round(box.height*.22)),x0=Math.max(inner.x,box.x-pad),y0=Math.max(inner.y,box.y-pad),x1=Math.min(inner.x+inner.width,box.x+box.width+pad),y1=Math.min(inner.y+inner.height,box.y+box.height+pad);
       box={x:x0,y:y0,width:x1-x0,height:y1-y0};
      }else if(method==='cell'||method==='contrast')box=inner;
      if(method==='contrast'){
       const gray=[],hist=new Uint32Array(256);
       for(let yy=0;yy<box.height;yy++)for(let xx=0;xx<box.width;xx++){const p=((box.y+yy)*width+box.x+xx)*4,v=Math.round(.299*rgba[p]+.587*rgba[p+1]+.114*rgba[p+2]);gray.push(v);hist[v]++;}
       let acc=0,low=0,high=255;for(let k=0;k<256;k++){acc+=hist[k];if(acc>=gray.length*.03){low=k;break;}}
       acc=0;for(let k=0;k<256;k++){acc+=hist[k];if(acc>=gray.length*.9){high=k;break;}}
       pixels=new Uint8ClampedArray(gray.length*4);gray.forEach((v,n)=>{const next=high-low>40?Math.max(0,Math.min(255,Math.round((v-low)*255/(high-low)))):v;pixels[n*4]=pixels[n*4+1]=pixels[n*4+2]=next;pixels[n*4+3]=255;});
       w=box.width;h=box.height;box={x:0,y:0,width:w,height:h};
      }
      const input=prepareLine(pixels,w,h,box,assets.config),tensor=new ort.Tensor('float32',input.data,input.dims);let outputs;
      try{
       outputs=await session.run({[assets.config.inputName]:tensor});const output=outputs[assets.config.outputName],decoded=decodeCTC(output.data,output.dims,assets.config.characters,{digitsOnly:true});
       rows.push({slot:i+1,expected:form.targets[i],raw:decoded.raw,correct:decoded.raw===form.targets[i],edits:distance(decoded.raw,form.targets[i]),score:decoded.score});
      }finally{tensor.dispose();if(outputs)for(const t of Object.values(outputs))t.dispose();}
     }
     report.methods.push({method,exact:rows.filter(r=>r.correct).length,total:rows.length,characterErrors:rows.reduce((n,r)=>n+r.edits,0),short:rows.filter(r=>r.raw.length<4).length,ms:Math.round(performance.now()-started),rows});
    }
    reports.push(report);
   }
  }finally{await session.release();}
  return reports;
 },scenarios.map(makeForm));
 for(const report of result){
  assert.equal(report.slots,30);for(const method of report.methods){assert.equal(method.total,30);assert.ok(method.rows.every(row=>/^[0-9]*$/.test(row.raw)));}
  await writeFile('test-report/handwriting-'+report.scenario+'.png',Buffer.from(report.png,'base64'));delete report.png;reports.push(report);
 }
 await writeFile('test-report/handwriting.json',JSON.stringify({synthetic:true,personalAccuracy:false,model:'ppocr-v5-ch',reports},null,2));
 console.log('HANDWRITING_BENCHMARK',JSON.stringify(reports.map(r=>({scenario:r.scenario,methods:r.methods.map(({rows,...summary})=>({...summary,errors:rows.filter(x=>!x.correct).slice(0,8).map(({slot,expected,raw})=>({slot,expected,raw}))}))}))));
}finally{await browser.close();server.kill();}
