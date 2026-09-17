import { segment } from './segmentation.js?build=80613cecd6f2';
import { prepareLine, decodeCTC } from './paddle.js?build=80613cecd6f2';
import { normalizedTranscript, engineById } from './engines.js?build=80613cecd6f2';
self.onmessage=async({data})=>{
 const {id,engine,rgba,width,height,options,assets}=data;let session;
 const progress=message=>self.postMessage({id,type:'progress',message});
 try{
  if(engineById(engine)?.kind!=='line')throw new Error('未知整列模型。');
  if(!assets||assets.config?.id!==engine||!(assets.weights instanceof ArrayBuffer))throw new Error('缺少已驗證的模型權重。');
  // Parent window has already verified and cached the weights. Transfer avoids
  // duplicating their buffer and the cache survives termination of this Worker.
  const ort=await import(assets.mainUrl);
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths={mjs:assets.glueUrl,wasm:assets.wasmUrl};
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
    const output=outputs[assets.config.outputName],result=decodeCTC(output.data,output.dims,assets.config.characters);
    rows.push({box:piece.box,raw:normalizedTranscript(result.raw),transcript:result.raw,predictions:[],score:result.score,uncertain:true,reason:'整列辨識；請核對，不以模型分數比較不同模型。',modelHash:assets.modelHash});
   }finally{tensor.dispose();if(outputs)for(const t of Object.values(outputs))t.dispose();}
   progress(`辨識第 ${i+1} / ${pieces.length} 列`);
  }
  self.postMessage({id,type:'result',rows,engine,modelBytes:assets.bytes});
 }catch(error){self.postMessage({id,type:'error',message:String(error.message||error)});}
 finally{if(session)await session.release().catch(()=>{});}
};
