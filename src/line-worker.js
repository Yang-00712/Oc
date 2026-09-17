import { segment } from './segmentation.js?build=6ac4ff17052f';
import { prepareLine, decodeCTC } from './paddle.js?build=6ac4ff17052f';
import { normalizedTranscript, engineById } from './engines.js?build=6ac4ff17052f';
self.onmessage=async({data})=>{
 const {id,engine,rgba,width,height,options,assets}=data;let session,stage='準備辨識';const localUrls=[];
 const progress=message=>{stage=message;self.postMessage({id,type:'progress',message});};
 try{
  if(engineById(engine)?.kind!=='line')throw new Error('未知整列模型。');
  if(!assets||assets.config?.id!==engine||!(assets.weights instanceof ArrayBuffer))throw new Error('缺少已驗證的模型權重。');
  // Parent window has already verified and cached the weights. Transfer avoids
  // duplicating their buffer and the cache survives termination of this Worker.
  if(!assets.runtime)throw new Error('缺少已保存的共用引擎。');
  const localFile=(name,type)=>{
   const bytes=assets.runtime[name];if(!(bytes instanceof ArrayBuffer)||!bytes.byteLength)throw new Error('共用引擎內容無效：'+name);
   const url=URL.createObjectURL(new Blob([bytes],{type}));localUrls.push(url);return url;
  };
  // Parent verifies every byte against the site's pinned catalog. These local
  // URLs bypass HTTP for the entire runtime; never execute archive-provided code
  // before that verification. Keep numThreads=1: no nested runtime workers.
  progress('載入已存共用引擎…');
  const mainUrl=localFile('ort.wasm.min.mjs','text/javascript');
  const glueUrl=localFile('ort-wasm-simd-threaded.mjs','text/javascript');
  const wasmUrl=localFile('ort-wasm-simd-threaded.wasm','application/wasm');
  const ort=await import(mainUrl);
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths={mjs:glueUrl,wasm:wasmUrl};
  progress('初始化本機模型…');
  session=await ort.InferenceSession.create(assets.weights,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const pieces=segment(rgba,width,height,options),rows=[];
  for(let i=0;i<pieces.length;i++){
   const piece=pieces[i];
   if(!piece.glyphs.length){rows.push({box:piece.box,raw:'',transcript:'',predictions:[],uncertain:true,reason:piece.reason,modelHash:assets.modelHash});continue;}
   const input=prepareLine(rgba,width,height,piece.lineBox||piece.box,assets.config);
   const tensor=new ort.Tensor('float32',input.data,input.dims);let outputs;
   try{
    outputs=await session.run({[assets.config.inputName]:tensor});
    const output=outputs[assets.config.outputName],result=decodeCTC(output.data,output.dims,assets.config.characters,{digitsOnly:true});
    rows.push({box:piece.box,raw:normalizedTranscript(result.raw),transcript:result.unrestrictedRaw,numericOnly:true,predictions:[],score:result.score,uncertain:true,reason:'僅辨識數字 0–9；未補字或修正時間。'+(result.restrictedFrames?'已排除非數字候選，請核對原圖。':''),modelHash:assets.modelHash});
   }finally{tensor.dispose();if(outputs)for(const t of Object.values(outputs))t.dispose();}
   progress(`辨識第 ${i+1} / ${pieces.length} 列`);
  }
  self.postMessage({id,type:'result',rows,engine,modelBytes:assets.bytes});
 }catch(error){self.postMessage({id,type:'error',message:stage+'：'+String(error.message||error)});}
 finally{if(session)await session.release().catch(()=>{});for(const url of localUrls)URL.revokeObjectURL(url);}
};
