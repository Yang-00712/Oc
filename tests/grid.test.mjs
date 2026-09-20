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
