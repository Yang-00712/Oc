export async function decodePhoto(file){
    if(!file||file.size>20*1024*1024) throw new Error('照片上限為 20 MB；請選較小的圖片。');
    const url=URL.createObjectURL(file);
    try {
        const image=await new Promise((resolve,reject)=>{
            const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('此圖片無法解碼，請改用 JPEG、PNG 或相機拍照。'));image.src=url;
        });
        if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>50000000) throw new Error('照片尺寸過大，請先縮小。');
        const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;
    } finally {URL.revokeObjectURL(url);}
}
export function rotatedPhoto(source,angle){
    const canvas=document.createElement('canvas');
    canvas.width=source.width;canvas.height=source.height;
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.translate(canvas.width/2,canvas.height/2);context.rotate(angle*Math.PI/180);context.drawImage(source,-source.width/2,-source.height/2);
    return canvas;
}
export function cropPhoto(source,roi){
    const x=Math.max(0,Math.floor(roi.x*source.width)),y=Math.max(0,Math.floor(roi.y*source.height));
    const width=Math.min(source.width-x,Math.round(roi.w*source.width)),height=Math.min(source.height-y,Math.round(roi.h*source.height));
    if(width<20||height<20) throw new Error('框選範圍太小，請重新拖曳。');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(source,x,y,width,height,0,0,width,height);return canvas;
}
export function thumbnail(source,box){
    const width=160,height=Math.max(12,Math.min(100,Math.round(box.height*width/box.width)));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(source,box.x,box.y,box.width,box.height,0,0,width,height);
    return canvas.toDataURL('image/png');
}
