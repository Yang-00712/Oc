// Give faint edge strokes room without crossing a grid rule or neighbouring cell.
// Free-hand row crops keep their existing behavior; this is one pass, not a retry.
export function recognitionBox(piece,{rowMode}={}){
 const box=piece.lineBox||piece.box;
 if(rowMode!=='grid30'||!piece.lineBox)return box;
 const inner={x:piece.box.x,y:piece.box.y+3,width:piece.box.width,height:piece.box.height-6};
 const pad=Math.max(3,Math.round(box.height*.22)),left=Math.max(inner.x,box.x-pad),top=Math.max(inner.y,box.y-pad),right=Math.min(inner.x+inner.width,box.x+box.width+pad),bottom=Math.min(inner.y+inner.height,box.y+box.height+pad);
 // A user-specified missing outside border can legitimately touch the crop edge.
 // Fall back rather than shrinking or inverting its already valid line crop.
 if(left>box.x||top>box.y||right<box.x+box.width||bottom<box.y+box.height)return box;
 return {x:left,y:top,width:right-left,height:bottom-top};
}
// PaddleOCR/RapidOCR recognition contract: BGR, CHW, height 48, x/127.5-1,
// zero padding, then greedy CTC. Digit restriction changes decoding, not weights.
export function prepareLine(rgba,width,height,box,config){
 const H=config.height,W=Math.max(config.width,Math.ceil(H*box.width/box.height));
 if(H!==48||W>1600||box.width<1||box.height<1||box.x<0||box.y<0||box.x+box.width>width||box.y+box.height>height)throw new Error('時間列範圍不正確；請框近時間欄。');
 const resized=Math.min(W,Math.ceil(H*box.width/box.height)),tensor=new Float32Array(3*H*W);
 for(let y=0;y<H;y++)for(let x=0;x<resized;x++){
  const fy=Math.max(0,Math.min(box.height-1,(y+.5)*box.height/H-.5)),fx=Math.max(0,Math.min(box.width-1,(x+.5)*box.width/resized-.5));
  const y0=Math.floor(fy),x0=Math.floor(fx),y1=Math.min(y0+1,box.height-1),x1=Math.min(x0+1,box.width-1),dy=fy-y0,dx=fx-x0;
  for(let c=0;c<3;c++){
   const channel=2-c,at=(xx,yy)=>rgba[((box.y+yy)*width+box.x+xx)*4+channel];
   const v=at(x0,y0)*(1-dx)*(1-dy)+at(x1,y0)*dx*(1-dy)+at(x0,y1)*(1-dx)*dy+at(x1,y1)*dx*dy;
   tensor[c*H*W+y*W+x]=v/127.5-1;
  }
 }
 return {data:tensor,dims:[1,3,H,W]};
}
// The default retains the full-alphabet API for diagnostics and existing callers.
// Production time recognition passes digitsOnly:true. Blank stays at index zero;
// dictionary indices are never removed/reindexed (the general model differs).
export function decodeCTC(data,dims,characters,{digitsOnly=false}={}){
 if(!Array.isArray(characters)||dims.length!==3||dims[0]!==1||!Number.isInteger(dims[1])||dims[1]<0||dims[2]!==characters.length||!characters.length||data.length!==dims[1]*dims[2])throw new Error('模型輸出與字典不相符，沒有猜補結果。');
 let allowed;
 if(digitsOnly){
  if(characters[0]!=='')throw new Error('數字解碼需要第 0 類為 CTC 空白標記。');
  allowed=new Uint8Array(characters.length);allowed[0]=1;
  const digits=new Set();
  characters.forEach((character,index)=>{
   if(typeof character==='string'&&/^[0-9]$/.test(character)){
    if(digits.has(character))throw new Error('模型數字字典重複，沒有猜補結果。');
    digits.add(character);allowed[index]=1;
   }
  });
  if(digits.size!==10)throw new Error('模型字典缺少完整 0–9，沒有猜補結果。');
 }
 let raw='',last=-1,sum=0,count=0,minimum=Infinity;
 let unrestrictedRaw='',unrestrictedLast=-1,restrictedFrames=0;
 for(let t=0;t<dims[1];t++){
  let best=0,score=-Infinity,unrestrictedBest=0,unrestrictedScore=-Infinity;
  for(let c=0;c<dims[2];c++){
   const value=data[t*dims[2]+c];
   if(!Number.isFinite(value))throw new Error('模型輸出非有限數值。');
   if(value>unrestrictedScore){unrestrictedScore=value;unrestrictedBest=c;}
   if((!allowed||allowed[c])&&value>score){score=value;best=c;}
  }
  if(best!==0&&best!==last){raw+=characters[best];sum+=score;minimum=Math.min(minimum,score);count++;}
  last=best;
  if(digitsOnly){
   if(unrestrictedBest!==0&&unrestrictedBest!==unrestrictedLast)unrestrictedRaw+=characters[unrestrictedBest];
   unrestrictedLast=unrestrictedBest;
   if(best!==unrestrictedBest)restrictedFrames++;
  }
 }
 const result={raw,score:count?sum/count:0};
 // Keep the original scores (no renormalization to inflate confidence) and the
 // original transcription. No O->0 substitution, padding, clipping or HHMM repair.
 return digitsOnly?{...result,minimumScore:count?minimum:0,unrestrictedRaw,restrictedFrames}:result;
}
