// PaddleOCR/RapidOCR recognition contract: BGR, CHW, height 48, x/127.5-1,
// zero padding, then full-alphabet greedy CTC. No numeric-only forced decoding.
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
export function decodeCTC(data,dims,characters){
 if(dims.length!==3||dims[0]!==1||dims[2]!==characters.length||data.length!==dims[1]*dims[2])throw new Error('模型輸出與字典不相符，沒有猜補結果。');
 let raw='',last=-1,sum=0,count=0;
 for(let t=0;t<dims[1];t++){
  let best=0,score=-Infinity;
  for(let c=0;c<dims[2];c++){const v=data[t*dims[2]+c];if(!Number.isFinite(v))throw new Error('模型輸出非有限數值。');if(v>score){score=v;best=c;}}
  if(best!==0&&best!==last){raw+=characters[best];sum+=score;count++;}last=best;
 }
 return {raw,score:count?sum/count:0};
}
