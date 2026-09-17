// Pure pixel processing, shared by the worker and Node tests. Dark ink on light paper.
function runs(values, gap=1) {
    const result=[];let start=-1,last=-1;
    for(let i=0;i<values.length;i++) if(values[i]) {
        if(start<0) start=i;
        else if(i-last>gap+1) {result.push([start,last+1]);start=i;}
        last=i;
    }
    if(start>=0) result.push([start,last+1]);
    return result;
}
export function thresholdImage(rgba,width,height) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<8||height<8||width*height>3000000||rgba.length!==width*height*4) throw new Error('裁切影像尺寸無效或過大。');
    const gray=new Uint8Array(width*height),hist=new Uint32Array(256);
    for(let i=0;i<gray.length;i++) {const v=Math.round(.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2]);gray[i]=v;hist[v]++;}
    let totalSum=0;for(let i=0;i<256;i++) totalSum+=i*hist[i];
    let sum=0,count=0,best=-1,cut=127;
    for(let i=0;i<255;i++) {
        count+=hist[i];sum+=i*hist[i];
        if(!count||count===gray.length) continue;
        const difference=sum/count-(totalSum-sum)/(gray.length-count);
        const variance=count*(gray.length-count)*difference*difference;
        if(variance>best) {best=variance;cut=i;}
    }
    if(best<=0) return {mask:new Uint8Array(gray.length),width,height};
    // Local contrast is essential on folded/shadowed paper. A global Otsu
    // threshold alone turns shadows and show-through into bridges between rows.
    const stride=width+1,sumTable=new Float64Array((width+1)*(height+1)),sqTable=new Float64Array(sumTable.length);
    for(let y=0;y<height;y++){let sum=0,sq=0;for(let x=0;x<width;x++){const v=gray[y*width+x];sum+=v;sq+=v*v;const i=(y+1)*stride+x+1;sumTable[i]=sumTable[i-stride]+sum;sqTable[i]=sqTable[i-stride]+sq;}}
    const radius=Math.max(9,Math.min(25,Math.round(width/8))),mask=new Uint8Array(gray.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const x0=Math.max(0,x-radius),y0=Math.max(0,y-radius),x1=Math.min(width,x+radius+1),y1=Math.min(height,y+radius+1),n=(x1-x0)*(y1-y0);
        const area=t=>t[y1*stride+x1]-t[y0*stride+x1]-t[y1*stride+x0]+t[y0*stride+x0];
        const mean=area(sumTable)/n,std=Math.sqrt(Math.max(0,area(sqTable)/n-mean*mean));
        const local=mean*(1+.24*(std/128-1));
        mask[y*width+x]=gray[y*width+x]<=Math.min(cut,local)?1:0;
    }

    for(const [horizontal,size,other] of [[true,height,width],[false,width,height]]) {
        const projection=new Uint8Array(size);
        for(let a=0;a<size;a++) {let n=0;for(let b=0;b<other;b++) n+=mask[horizontal?a*width+b:b*width+a];projection[a]=n>=other*.90?1:0;}
        for(const [start,end] of runs(projection,0)) if(end-start<=3) for(let a=start;a<end;a++) for(let b=0;b<other;b++) mask[horizontal?a*width+b:b*width+a]=0;
    }
    return {mask,width,height};
}
function bounds(mask,w,x0,y0,x1,y1) {
    let left=x1,right=x0,top=y1,bottom=y0,ink=0;
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) if(mask[y*w+x]) {left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);ink++;}
    return ink?{x:left,y:top,width:right-left,height:bottom-top,ink}:null;
}
export function normalizeDigit(mask,width,box) {
    if(!box || box.ink<3) return new Uint8Array(784);
    const scale=20/Math.max(box.width,box.height);
    const dw=Math.max(1,Math.round(box.width*scale)),dh=Math.max(1,Math.round(box.height*scale));
    const ox=Math.floor((28-dw)/2),oy=Math.floor((28-dh)/2),result=new Uint8Array(784);
    for(let y=0;y<dh;y++) for(let x=0;x<dw;x++) {
        let ink=0;
        for(const sy of [.25,.75]) for(const sx of [.25,.75]) {
            const ix=box.x+Math.min(box.width-1,Math.floor((x+sx)*box.width/dw));
            const iy=box.y+Math.min(box.height-1,Math.floor((y+sy)*box.height/dh));
            ink+=mask[iy*width+ix];
        }
        result[(oy+y)*28+ox+x]=Math.round(ink*255/4);
    }
    let mass=0,mx=0,my=0;for(let y=0;y<28;y++) for(let x=0;x<28;x++) {const v=result[y*28+x];mass+=v;mx+=x*v;my+=y*v;}
    if(!mass) return result;
    const dx=Math.round(13.5-mx/mass),dy=Math.round(13.5-my/mass),centered=new Uint8Array(784);
    for(let y=0;y<28;y++) for(let x=0;x<28;x++) if(x+dx>=0&&x+dx<28&&y+dy>=0&&y+dy<28) centered[(y+dy)*28+x+dx]=result[y*28+x];
    return centered;
}
export function segment(rgba,width,height,options={}) {
    const {mask}=thresholdImage(rgba,width,height);
    const fixed=Number(options.rowCount||0);
    if(!Number.isInteger(fixed)||fixed<0||fixed>100) throw new Error('列數請填 1–100，或留空自動判斷。');
    const projection=new Uint8Array(height);
    for(let y=0;y<height;y++) {let count=0;for(let x=0;x<width;x++) count+=mask[y*width+x];projection[y]=count>=2?1:0;}
    let bands=runs(projection,Math.max(2,Math.min(4,Math.round(height/700)))).filter(([s,e])=>e-s>=4);
    // A requested count is a check, not permission to divide unequal handwriting evenly.
    if(fixed&&bands.length!==fixed)throw new Error(`自動找到 ${bands.length} 列，與指定 ${fixed} 列不同。請框近時間欄或分段辨識；不會等高硬切混入多列。`);
    if(!bands.length) throw new Error('未找到數字列。請框近時間欄、拍正紙張並避開反光。');
    if(bands.length>100) throw new Error('偵測超過 100 列；請縮小範圍或指定列數。');
    return bands.map(([start,end])=>{
        const box=bounds(mask,width,0,start,width,end);
        if(!box) return {box:{x:0,y:start,width,height:end-start},glyphs:[],uncertain:true,reason:'空白列，請人工輸入或刪除。'};
        const vertical=new Uint8Array(box.width);
        for(let x=0;x<box.width;x++) for(let y=box.y;y<box.y+box.height;y++) if(mask[y*width+box.x+x]) {vertical[x]=1;break;}
        const groups=runs(vertical,0).filter(([s,e])=>{
            const b=bounds(mask,width,box.x+s,box.y,box.x+e,box.y+box.height);return b&&b.ink>=3;
        });
        const automatic=options.digitMode!=='equal' && groups.length===4;
        const split=automatic?groups.map(([s,e])=>[box.x+s,box.x+e]):Array.from({length:4},(_,i)=>[box.x+Math.floor(i*box.width/4),box.x+Math.floor((i+1)*box.width/4)]);
        const glyphs=split.map(([s,e])=>normalizeDigit(mask,width,bounds(mask,width,s,start,e,end)));
        const pad=Math.max(2,Math.round(box.height*.12));
        const x=Math.max(0,box.x-pad),y=Math.max(start,box.y-pad);
        const lineBox={x,y,width:Math.min(width,box.x+box.width+pad)-x,height:Math.min(end,box.y+box.height+pad)-y};
        return {box:{x:0,y:start,width,height:end-start},lineBox,glyphs,uncertain:!automatic,reason:automatic?'':'按該列墨跡範圍切四格；請核對。'};
    });
}
