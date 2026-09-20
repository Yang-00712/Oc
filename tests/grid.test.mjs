import test from 'node:test';
import assert from 'node:assert/strict';
import { segment } from '../src/segmentation.js';

function paper(width,height) {
    const rgba=new Uint8Array(width*height*4).fill(255);
    const dot=(x,y)=>{const p=(y*width+x)*4;rgba[p]=rgba[p+1]=rgba[p+2]=20;};
    return {rgba,dot};
}

test('grid mode retains 30 ordered cells with a blank and unequal row heights',()=>{
    const width=112,heights=Array.from({length:30},(_,i)=>22+(i%4)*2);
    const lines=[5];for(const h of heights) lines.push(lines.at(-1)+h);
    const height=lines.at(-1)+6,{rgba,dot}=paper(width,height);
    for(const line of lines) for(let x=2;x<110;x++) dot(x,line);
    for(let y=lines[0];y<=lines.at(-1);y++) {dot(2,y);dot(109,y);}
    for(let row=0;row<30;row++) {
        if(row===11) continue;
        for(const x of [21,40,59,78]) for(let y=lines[row]+7;y<lines[row]+14;y++) {dot(x,y);dot(x+1,y);}
    }
    const cells=segment(rgba,width,height,{rowMode:'grid30',rowCount:30});
    assert.equal(cells.length,30);
    assert.deepEqual(cells.map(cell=>cell.box.y),lines.slice(0,-1));
    assert.deepEqual(cells.map(cell=>cell.box.height),heights);
    assert.equal(cells[11].glyphs.length,0);
    assert.equal(cells[11].uncertain,true);
    assert.equal(cells[12].glyphs.length,4);
    assert.ok(cells.every((cell,i)=>!cell.lineBox||
        (cell.lineBox.x>2&&cell.lineBox.x+cell.lineBox.width<109&&
         cell.lineBox.y>lines[i]&&cell.lineBox.y+cell.lineBox.height<lines[i+1])));
    assert.throws(()=>segment(rgba,width,height,{rowMode:'grid30',rowCount:29}),/必須是 30/);
});

test('grid mode refuses an unruled crop rather than inventing rows',()=>{
    const {rgba,dot}=paper(112,760);
    for(let row=0;row<30;row++) for(const x of [20,39,58,77])
        for(let y=10+row*24;y<17+row*24;y++) dot(x,y);
    assert.throws(()=>segment(rgba,112,760,{rowMode:'grid30'}),/找不到完整的 30 格邊界/);
});

test('inset borders and page margins do not turn a blank cell into digits',()=>{
    const width=112,height=900,{rgba,dot}=paper(width,height);
    const lines=Array.from({length:31},(_,i)=>100+i*22);
    for(const line of lines) for(let x=20;x<=110;x++) dot(x,line);
    for(let y=lines[0];y<=lines.at(-1);y++) {dot(20,y);dot(110,y);}
    for(let row=0;row<30;row++) if(row!==11)
        for(const x of [35,50,65,80]) for(let y=lines[row]+7;y<lines[row]+14;y++) {dot(x,y);dot(x+1,y);}
    const cells=segment(rgba,width,height,{rowMode:'grid30',rowCount:30});
    assert.equal(cells.length,30);
    assert.equal(cells[11].glyphs.length,0);
    assert.match(cells[11].reason,/空白/);
    assert.ok(cells[12].lineBox.x>20);
    assert.ok(cells[12].lineBox.x+cells[12].lineBox.width<110);
});

function ruledCrop({omit=[],rows=30,margin=0,blackBand=false}={}){
    const width=112,height=rows*24+1+margin,{rgba,dot}=paper(width,height);
    for(let i=0;i<=rows;i++)if(!omit.includes(i))for(let x=2;x<110;x++)dot(x,margin+i*24);
    for(let y=margin;y<height;y++){dot(2,y);dot(109,y);}
    for(let row=0;row<rows;row++)if(row!==11)
        for(const x of [21,40,59,78])for(let y=margin+row*24+8;y<margin+row*24+15;y++){dot(x,y);dot(x+1,y);}
    if(blackBand)for(let y=0;y<16;y++)for(let x=2;x<110;x++)dot(x,y);
    return {rgba,width,height};
}
function grid(crop,gridEdges='auto'){return segment(crop.rgba,crop.width,crop.height,{rowMode:'grid30',gridEdges});}
test('missing top outer rule needs an explicit crop-top choice and preserves blank row 12',()=>{
    const crop=ruledCrop({omit:[0]});
    assert.throws(()=>grid(crop),/偵測到 30 條/);
    const cells=grid(crop,'crop-top');
    assert.equal(cells.length,30);assert.equal(cells[0].box.y,0);
    assert.equal(cells[0].uncertain,true);assert.match(cells[0].reason,/上緣/);
    assert.equal(cells[11].glyphs.length,0);assert.equal(cells[12].glyphs.length,4);
    assert.ok(cells.every((cell,i)=>i===0||cell.box.y>cells[i-1].box.y));
});
test('missing bottom outer rule uses only the explicitly selected bottom edge',()=>{
    const crop=ruledCrop({omit:[30]}),cells=grid(crop,'crop-bottom');
    assert.equal(cells.length,30);assert.equal(cells[29].box.y+cells[29].box.height,crop.height-1);
    assert.match(cells[29].reason,/下緣/);assert.equal(cells[29].uncertain,true);
    assert.throws(()=>grid(crop,'crop-top'),/距離不像一格/);
});
test('both missing outer rules retain 30 slots only after an explicit two-edge choice',()=>{
    const crop=ruledCrop({omit:[0,30]});
    assert.throws(()=>grid(crop),/偵測到 29 條/);
    const cells=grid(crop,'crop-both');
    assert.equal(cells.length,30);assert.match(cells[0].reason,/上緣/);assert.match(cells[29].reason,/下緣/);
    assert.equal(cells[11].glyphs.length,0);
});
test('real 29-cell crop cannot silently become 30 cells',()=>{
    const crop=ruledCrop({rows:29});
    assert.throws(()=>grid(crop),/偵測到 30 條/);
    assert.throws(()=>grid(crop,'crop-top'),/距離不像一格/);
    assert.throws(()=>grid(crop,'crop-bottom'),/距離不像一格/);
    assert.throws(()=>grid(ruledCrop({rows:29,margin:24})),/偵測到 30 條/);
});
test('missing internal rule is rejected even if an outer edge is selected',()=>{
    const crop=ruledCrop({omit:[15]});
    assert.throws(()=>grid(crop,'crop-top'),/可能缺少中間格線/);
    assert.throws(()=>grid(crop,'crop-bottom'),/可能缺少中間格線/);
});
test('full rules cannot be combined with an extra crop edge',()=>{
    assert.throws(()=>grid(ruledCrop(),'crop-top'),/需要 30 條/);
    assert.throws(()=>grid(ruledCrop(),'unknown'),/選項無效/);
});
test('wide black masking is not accepted as a printed rule',()=>{
    assert.throws(()=>grid(ruledCrop({blackBand:true})),/黑帶/);
});

function widePaper({omit=[],gutter=false,tilt=0,extraColumn=false,green=[90,190,90],margins=5}={}){
    const width=280,tableHeight=720,height=tableHeight+margins*2+1,{rgba,dot}=paper(width,height);
    for(let y=0;y<height;y++)for(let x=176;x<width;x++){const p=(y*width+x)*4;[rgba[p],rgba[p+1],rgba[p+2]]=green;}
    const left=y=>95+Math.round(tilt*(y-margins)/tableHeight);
    for(let y=margins;y<=margins+tableHeight;y++){
        dot(left(y),y);dot(175,y);if(gutter)dot(80,y);
        if(extraColumn)dot(220,y);
    }
    for(let row=0;row<=30;row++)if(!omit.includes(row)){
        const y=margins+row*24;
        for(let x=gutter?80:left(y);x<=(extraColumn?220:175);x++)dot(x,y);
    }
    for(let row=0;row<30;row++)if(row!==11){
        const top=margins+row*24;
        for(const x of [111,126,141,156])for(let y=top+8;y<top+15;y++){dot(x,y);dot(x+1,y);}
    }
    // Ordinary notes outside the selected table must not enter any row image.
    for(let y=10;y<height;y+=30)for(let x=12;x<42;x++)dot(x,y);
    return {rgba,width,height,left};
}
test('wide crop with green masking finds the actual column and keeps blank slot 12',()=>{
    const crop=widePaper(),cells=grid(crop);
    assert.equal(cells.length,30);assert.equal(cells[11].glyphs.length,0);
    for(const cell of cells){assert.ok(cell.box.x>=95&&cell.box.x+cell.box.width<175);if(cell.lineBox)assert.ok(cell.lineBox.x>=95&&cell.lineBox.x+cell.lineBox.width<175);}
});
test('thin tilted borders plus a narrow side gutter do not become a digit',()=>{
    const crop=widePaper({gutter:true,tilt:-15,margins:65}),cells=grid(crop);
    assert.equal(cells.length,30);assert.equal(cells[11].glyphs.length,0);
    assert.ok(cells[0].box.x>95);assert.ok(cells[29].box.x<95);
    assert.ok(cells.every(cell=>cell.box.x+cell.box.width<175));
});
test('wide crop still requires explicit consent for the missing outer edge',()=>{
    const crop=widePaper({gutter:true,tilt:-12,omit:[0],margins:0});
    assert.throws(()=>grid(crop),/偵測到 30 條/);
    const cells=grid(crop,'crop-top');
    assert.equal(cells.length,30);assert.match(cells[0].reason,/上緣/);assert.equal(cells[11].glyphs.length,0);
});
test('two plausible data columns are rejected instead of choosing silently',()=>{
    const crop=widePaper({extraColumn:true,green:[255,255,255]});
    assert.throws(()=>grid(crop),/多個可能的時間欄/);
});
test('a solid dark mask cannot masquerade as a thin outer rule',()=>{
    const crop=widePaper({gutter:true,green:[30,50,30]});
    assert.throws(()=>grid(crop),/無法定位|找不到完整/);
});

function shadePaper(crop,{start=0,end=140}={}){
    for(let y=0;y<crop.height;y++){
        const t=Math.max(0,Math.min(1,(y/crop.height-start)/(1-start))),gray=Math.round(255-(255-end)*t);
        for(let x=0;x<176;x++){
            const p=(y*crop.width+x)*4;
            if(crop.rgba[p]===255&&crop.rgba[p+1]===255&&crop.rgba[p+2]===255)crop.rgba[p]=crop.rgba[p+1]=crop.rgba[p+2]=gray;
        }
    }
    return crop;
}
test('gray paper gradient keeps 30 cells, blank row and excludes green masking',()=>{
    const crop=shadePaper(widePaper()),cells=grid(crop);
    assert.equal(cells.length,30);assert.equal(cells[11].glyphs.length,0);assert.equal(cells[12].glyphs.length,4);
    assert.ok(cells.every(cell=>cell.box.x>=95&&cell.box.x+cell.box.width<175));
});
test('steeper bottom shadow retains explicit missing top rule handling',()=>{
    const crop=shadePaper(widePaper({omit:[0],margins:0}),{start:.6});
    assert.throws(()=>grid(crop),/偵測到 30 條/);
    const cells=grid(crop,'crop-top');
    assert.equal(cells.length,30);assert.equal(cells[0].uncertain,true);assert.equal(cells[11].glyphs.length,0);
    assert.ok(cells.at(-1).box.y+cells.at(-1).box.height<=crop.height);
});
test('true black band is rejected even on gray-gradient paper',()=>{
    const crop=shadePaper(widePaper({margins:5}));
    for(let y=0;y<16;y++)for(let x=95;x<=175;x++){
        const p=(y*crop.width+x)*4;crop.rgba[p]=crop.rgba[p+1]=crop.rgba[p+2]=20;
    }
    assert.throws(()=>grid(crop),/黑帶/);
});
