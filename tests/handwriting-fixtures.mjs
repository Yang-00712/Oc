// Deterministic synthetic pen strokes with known answers; not user handwriting.
// Each digit is a hand-authored path, not a font or a training sample.
export const targets=['0905','0911','0928','0930','0936','0947','0959','1000','1004','1018','1022','1033','1046','1055','1101','1111','1127','1138','1144','1156','1309','1316','1324','1337','1348','1359','1402','1402','1415','1408'];
export const scenarios=['clear','shadow','tight','rough'];
const strokes={
 '0':['M9 1 C1 1 1 9 2 18 C3 27 12 28 16 20 C20 10 18 0 9 1'],
 '1':['M4 6 Q9 3 10 1 L9 26'],
 '2':['M2 7 C5 -1 17 -1 17 7 C17 12 5 20 2 25 Q10 24 18 25'],
 '3':['M2 3 Q9 -1 15 2 Q21 8 10 12 Q21 11 17 21 Q12 30 2 24'],
 '4':['M12 1 L2 17 Q10 18 19 16 M14 3 L12 27'],
 '5':['M18 2 Q10 1 4 2 L3 12 Q18 8 18 20 Q14 29 2 24'],
 '6':['M16 1 Q5 2 3 15 Q0 28 12 26 Q22 20 15 14 Q9 9 3 17'],
 '7':['M1 2 Q10 1 19 2 Q11 11 7 27'],
 '8':['M10 1 C0 0 0 10 10 13 C23 18 18 29 7 26 C-3 24 1 15 10 13 C22 7 18 0 10 1'],
 '9':['M16 12 Q4 19 2 8 Q2 -1 13 2 Q22 6 12 27']
};
const alternate={
 '0':['M10 1 Q0 3 3 21 Q7 30 14 23 Q22 7 10 1'],
 '1':['M10 1 Q8 12 8 26'],
 '2':['M2 7 Q6 -2 15 3 Q22 9 3 24 Q11 20 19 25'],
 '3':['M2 3 Q20 -1 10 12 Q22 13 15 24 Q8 29 2 23'],
 '4':['M12 1 L2 18 L19 17 M15 5 L13 27'],
 '7':['M1 3 Q7 0 19 3 L6 27'],
 '9':['M16 3 Q2 -2 3 12 Q10 18 17 7 Q17 18 10 27']
};
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function makeForm(scenario='clear'){
 if(!scenarios.includes(scenario))throw Error('Unknown synthetic scenario');
 const random=rng(712),lines=[110];for(let i=0;i<30;i++)lines.push(lines.at(-1)+31+Math.round(i*.25));
 const rough=scenario==='rough',tilted=scenario==='tight'||rough,offset=y=>tilted?-15*(y-110)/(lines.at(-1)-110):0;
 const elements=[],bottom=lines.at(-1),color=(scenario==='shadow'||rough)?'url(#paper)':'#ebe8de';
 elements.push('<rect width="640" height="1280" fill="'+color+'"/>','<rect x="391" y="50" width="225" height="1160" fill="#65bd68"/>');
 elements.push('<text x="28" y="55" fill="#56594c" font-size="17">SYNTHETIC HANDWRITING / 30 ROWS</text>','<text x="28" y="79" fill="#56594c" font-size="12">Known answers. Not a measurement of personal handwriting accuracy.</text>');
 elements.push('<path d="M260 110 V'+bottom+' M'+(280+offset(110))+' 110 L'+(280+offset(bottom))+' '+bottom+' M'+(390+offset(110))+' 110 L'+(390+offset(bottom))+' '+bottom+'" fill="none" stroke="#303234" stroke-width="1.1"/>');
 for(const y of lines)elements.push('<path d="M260 '+y+' H'+(390+offset(y))+'" stroke="#303234" stroke-width="1.1"/>');
 targets.forEach((value,row)=>{
  const y=lines[row],h=lines[row+1]-y;
  elements.push('<text x="224" y="'+(y+h*.65)+'" fill="#6b6d63" font-size="11">R'+String(row+1).padStart(2,'0')+' / note</text>');
  [...value].forEach((digit,col)=>{
   const x=286+offset(y)+col*(rough?21:tilted?21.5:24)+(random()-.5)*(rough?4:2),dy=y+(h-23)/2+(random()-.5)*(rough?5:2),angle=(random()-.5)*(rough?18:tilted?12:6);
   const strokeWidth=(rough?1.05:tilted?1.3:1.5)+(random()-.5)*.3;
   const opacity=(scenario==='shadow'||rough)&&[1,4,8,12,18,25].includes(row)&&col===3?.42:rough?.76:.88;
   elements.push('<g transform="translate('+x.toFixed(2)+' '+dy.toFixed(2)+') rotate('+angle.toFixed(2)+' 10 13) scale(1 .83)" stroke="#344b84" stroke-opacity="'+opacity+'" stroke-width="'+strokeWidth.toFixed(2)+'" stroke-linecap="round" stroke-linejoin="round" fill="none">'+(rough&&(row+col)%2===0&&alternate[digit]?alternate[digit]:strokes[digit]).map(d=>'<path d="'+d+'"/>').join('')+'</g>');
  });
 });
 elements.push('<text x="28" y="1222" fill="#56594c" font-size="14">Oc test sheet · '+scenario+' · no private form content</text>');
 return {scenario,targets:[...targets],roi:{x:220,y:104,width:220,height:bottom-104+7},svg:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1280" viewBox="0 0 640 1280"><defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eeeade"/><stop offset="1" stop-color="#999999"/></linearGradient></defs>'+elements.join('')+'</svg>'};
}
