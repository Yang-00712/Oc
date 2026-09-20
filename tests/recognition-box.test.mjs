import test from 'node:test';
import assert from 'node:assert/strict';
import {recognitionBox,prepareLine} from '../src/paddle.js';
const piece={box:{x:10,y:0,width:80,height:40},lineBox:{x:20,y:10,width:55,height:20}};
test('grid crop includes a faint edge stroke excluded by the tight ink bound',()=>{
 const rgba=new Uint8Array(100*40*4).fill(255);for(let y=12;y<25;y++){const i=(y*100+77)*4;rgba[i]=rgba[i+1]=rgba[i+2]=140;}
 const before=prepareLine(rgba,100,40,piece.lineBox,{height:48,width:320}),box=recognitionBox(piece,{rowMode:'grid30'}),after=prepareLine(rgba,100,40,box,{height:48,width:320});
 const dark=arr=>Array.from(arr).some(v=>v>0&&v<.9);assert.equal(dark(before.data),false);assert.equal(dark(after.data),true);
 assert.ok(box.x>=piece.box.x&&box.x+box.width<=piece.box.x+piece.box.width);assert.ok(box.y>=3&&box.y+box.height<=37);
});
test('free handwriting and a row without a line crop preserve the original box',()=>{
 assert.equal(recognitionBox(piece,{rowMode:'auto'}),piece.lineBox);assert.equal(recognitionBox({box:piece.box},{rowMode:'grid30'}),piece.box);
});
test('explicit outer crop edge is not cut back to an artificial three-pixel inset',()=>{
 const p={box:{x:0,y:0,width:60,height:30},lineBox:{x:2,y:0,width:50,height:24}};assert.equal(recognitionBox(p,{rowMode:'grid30'}),p.lineBox);
});
test('expansion never escapes a narrow cell or mutates segmentation results',()=>{
 const p={box:{x:0,y:0,width:10,height:16},lineBox:{x:0,y:3,width:10,height:10}},before=JSON.stringify(p);assert.deepEqual(recognitionBox(p,{rowMode:'grid30'}),p.lineBox);assert.equal(JSON.stringify(p),before);
});
