import { parseTime, exportTimes, orderWarnings } from './time.js?build=6ea10ff10bf7';
import { decodePhoto, rotatedPhoto, cropPhoto, thumbnail } from './photo.js?build=6ea10ff10bf7';
import * as store from './store.js?build=6ea10ff10bf7';

const $=id=>document.getElementById(id);
let rows=[], source=null, photo=null, roi={x:0,y:0,w:1,h:1},worker=null,job=0,timer=null,saving=Promise.resolve(),storageSafe=true;
const node=(tag,text,css)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(css)item.className=css;return item;};
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function protect(action){return async event=>{try{await action(event);}catch(error){notice(error.message||String(error),true);}};}
function tab(name){
    for(const page of document.querySelectorAll('.page'))page.hidden=page.id!==name;
    for(const button of document.querySelectorAll('[data-tab]')){if(button.dataset.tab===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    if(name==='settings') void refreshMetrics();
    window.scrollTo(0,0);
}
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>tab(button.dataset.tab);
function newRow(value=''){return {id:crypto.randomUUID(),value,raw:value,confirmed:false,thumbnail:'',predictions:[],uncertain:false,reason:'人工輸入',modelHash:null};}
function save(){
    if(!storageSafe){$('save-status').textContent='儲存不可用；目前只保留在這次畫面。請匯出後再關閉。';return;}
    const snapshot={schema:1,rows:structuredClone(rows)};
    $('save-status').textContent='正在保存本機草稿…';
    saving=saving.catch(()=>{}).then(()=>store.setState('draft',snapshot)).then(()=>{$('save-status').textContent='已保存本機草稿（不含整張照片）。';}).catch(error=>{
        $('save-status').textContent='保存失敗：'+error.message+'。請勿關閉，先匯出。';notice('本機草稿保存失敗；沒有回報成功。',true);
    });
}
function updateCounter(){
    const valid=rows.filter(r=>r.confirmed&&parseTime(r.value).valid).length;
    $('review-count').textContent=rows.length?`${rows.length} 列 · 已確認 ${valid} 列 · 待核對 ${rows.length-valid} 列`:'還沒有結果，可先拍照，或新增一列手動輸入。';
}
function refreshRow(row,element,index){
    const time=parseTime(row.value),prob=row.predictions.length?Math.min(...row.predictions.map(p=>p.score)):null;
    const warning=orderWarnings(rows)[index];
    element.classList.toggle('confirmed',row.confirmed&&time.valid);
    element.classList.toggle('warn',!row.confirmed);
    const info=element.querySelector('.row-message');
    const messages=[time.valid?time.formatted:time.error];
    if(row.raw)messages.push(`初判 ${row.raw}`);
    if(prob!==null)messages.push(`最低模型分數 ${Math.round(prob*100)}%（非正確率）`);
    if(row.reason)messages.push(row.reason);
    if(warning)messages.push('早於上一列，請核對；不自動更改');
    if(row.confirmed)messages.push('已人工確認');
    info.textContent=messages.join(' · ');info.classList.toggle('invalid',!time.valid);
    const button=element.querySelector('.confirm-row');button.textContent=row.confirmed?'已確認 ✓':'確認';
    updateCounter();
}
async function confirmRow(row){
    const parsed=parseTime(row.value);if(!parsed.valid)throw new Error(parsed.error);
    row.value=parsed.raw;row.confirmed=true;
    // Row-level labels only: unreviewed digit segmentation is NOT a training label.
    if($('collect').checked&&row.thumbnail){
        try{await store.saveSample({id:row.id,schema:1,time:parsed.raw,image:row.thumbnail,initial:row.raw,modelHash:row.modelHash,segmentationReviewed:false,confirmedAt:new Date().toISOString()});}
        catch(error){notice('時間已確認，但教材未保存：'+error.message,true);}
    }
}
function invalidateSample(row){if(storageSafe)void store.deleteSample(row.id).catch(error=>notice('舊教材標籤未能移除：'+error.message,true));}
function renderRows(){
    $('rows').replaceChildren();
    rows.forEach((row,index)=>{
        const element=node('article',undefined,'row'),head=node('div',undefined,'row-head');element.dataset.id=row.id;
        head.append(node('span',String(index+1).padStart(2,'0'),'row-number'));
        if(/^data:image\/png;base64,/.test(row.thumbnail)){const image=node('img');image.src=row.thumbnail;image.alt=`第 ${index+1} 列原圖`;head.append(image);}
        else head.append(node('span','手動輸入','small'));
        const remove=node('button','刪除','quiet');remove.type='button';remove.setAttribute('aria-label',`刪除第 ${index+1} 列`);remove.onclick=protect(async()=>{
            if(!confirm(`刪除第 ${index+1} 列？`))return;
            invalidateSample(row);rows=rows.filter(r=>r.id!==row.id);renderRows();save();
        });head.append(remove);
        const edit=node('div',undefined,'row-edit'),input=node('input'),confirmButton=node('button','確認','confirm-row');
        input.type='text';input.inputMode='numeric';input.maxLength=5;input.autocomplete='off';input.spellcheck=false;input.value=row.value;input.setAttribute('aria-label',`第 ${index+1} 列時間`);
        input.oninput=()=>{row.value=input.value;row.confirmed=false;invalidateSample(row);refreshRow(row,element,index);save();};
        input.onfocus=()=>{input.select();setTimeout(()=>element.scrollIntoView({block:'center',behavior:'smooth'}),250);};
        input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();confirmButton.click();}};
        confirmButton.type='button';confirmButton.onclick=protect(async()=>{
            await confirmRow(row);input.value=row.value;refreshRow(row,element,index);save();
            const next=element.nextElementSibling?.querySelector('input');if(next)next.focus();
        });edit.append(input,confirmButton);
        element.append(head,edit,node('p','','row-message'));
        if(row.predictions.length===4){
            const choices=node('div',undefined,'predictions');
            row.predictions.forEach((prediction,position)=>{if(prediction.score<.9||prediction.margin<.25){
                for(const candidate of prediction.candidates.slice(0,2)){
                    const button=node('button',`第${position+1}位 → ${candidate.digit}`);button.type='button';
                    button.onclick=()=>{const raw=row.value.replace(':','');if(!/^\d{4}$/.test(raw)){notice('先填齊四位數字，再替換候選。',true);return;}
                        row.value=raw.slice(0,position)+candidate.digit+raw.slice(position+1);row.confirmed=false;input.value=row.value;invalidateSample(row);refreshRow(row,element,index);save();};choices.append(button);
                }
            }});element.append(choices);
        }
        $('rows').append(element);refreshRow(row,element,index);
    });updateCounter();
}
function draw(){
    if(!photo)return;const canvas=$('photo-canvas');canvas.width=photo.width;canvas.height=photo.height;
    const context=canvas.getContext('2d');context.drawImage(photo,0,0);
    const {x,y,w,h}=roi;context.fillStyle='#08151088';context.fillRect(0,0,canvas.width,y*canvas.height);context.fillRect(0,(y+h)*canvas.height,canvas.width,(1-y-h)*canvas.height);context.fillRect(0,y*canvas.height,x*canvas.width,h*canvas.height);context.fillRect((x+w)*canvas.width,y*canvas.height,(1-x-w)*canvas.width,h*canvas.height);
    context.strokeStyle='#c5e6a4';context.lineWidth=Math.max(2,canvas.width/180);context.strokeRect(x*canvas.width,y*canvas.height,w*canvas.width,h*canvas.height);
    for(const key of ['x','y','w','h'])$('roi-'+key).value=Math.round(roi[key]*100);
}
function point(event){const rect=$('photo-canvas').getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
function validRoi(next){return next&&['x','y','w','h'].every(k=>Number.isFinite(next[k]))&&next.x>=0&&next.y>=0&&next.w>0&&next.h>0&&next.x+next.w<=1.001&&next.y+next.h<=1.001;}
let start=null;
$('photo-canvas').onpointerdown=event=>{if(worker)return;start=point(event);event.currentTarget.setPointerCapture(event.pointerId);};
$('photo-canvas').onpointermove=event=>{if(!start)return;const end=point(event);roi={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(start.x-end.x),h:Math.abs(start.y-end.y)};draw();};
$('photo-canvas').onpointerup=()=>{start=null;};$('photo-canvas').onpointercancel=()=>{start=null;};
for(const key of ['x','y','w','h'])$('roi-'+key).onchange=()=>{
    const next={};for(const k of ['x','y','w','h'])next[k]=Number($('roi-'+k).value)/100;
    if(!validRoi(next)){notice('框選座標超出照片，請調整。',true);draw();return;}
    roi=next;draw();
};
async function setPhoto(file){
    if(worker)throw new Error('請先取消目前辨識。');
    const decoded=await decodePhoto(file);if(source){source.width=1;source.height=1;}if(photo&&photo!==source){photo.width=1;photo.height=1;}
    source=decoded;photo=source;roi={x:0,y:0,w:1,h:1};$('angle').value=0;$('angle-value').value='0°';$('photo-empty').hidden=true;$('photo-editor').hidden=false;$('recognize').disabled=false;draw();
    notice('已載入照片。請框住時間欄；原照不會上傳或保存。');
}
for(const id of ['camera','photo'])$(id).onchange=protect(async event=>{const file=event.target.files?.[0];if(file)await setPhoto(file);event.target.value='';});
$('angle').oninput=()=>{if(!source||worker)return;const angle=Number($('angle').value);$('angle-value').value=angle+'°';if(photo!==source){photo.width=1;photo.height=1;}photo=rotatedPhoto(source,angle);draw();};
$('full-frame').onclick=()=>{if(!worker){roi={x:0,y:0,w:1,h:1};draw();}};
$('save-template').onclick=protect(async()=>{if(!validRoi(roi))throw new Error('請先框選有效範圍。');await store.setState('template',{schema:1,roi});notice('已記住比例範圍；每張照片仍需核對框位。');});
$('use-template').onclick=protect(async()=>{if(worker)return;const template=await store.getState('template');if(template?.schema!==1||!validRoi(template.roi))throw new Error('尚未記住有效範圍。');roi=template.roi;draw();notice('已套用比例範圍；拍攝角度或距離不同時請重新調整。');});
$('demo').onclick=protect(async()=>{const response=await fetch(new URL('../assets/demo-times.png',import.meta.url));if(!response.ok)throw new Error('示例載入失敗。');await setPhoto(new File([await response.blob()],'demo.png',{type:'image/png'}));notice('這是 MNIST 手寫數字組成的示例，不是你的字跡或實拍準確率。');});
function endWorker(){clearTimeout(timer);worker?.terminate();worker=null;$('recognize').disabled=!photo;$('cancel').hidden=true;}
$('cancel').onclick=()=>{job++;endWorker();$('progress').textContent='已取消，原有校正結果保留。';};
$('recognize').onclick=protect(async()=>{
    if(worker||!photo)return;
    if(rows.length&&!confirm('重新辨識會在成功後替換目前校正草稿。已確認要繼續？'))return;
    const crop=cropPhoto(photo,roi),pixels=crop.getContext('2d').getImageData(0,0,crop.width,crop.height),id=++job;
    worker=new Worker(new URL('./ocr-worker.js?build=6ea10ff10bf7',import.meta.url),{type:'module'});$('recognize').disabled=true;$('cancel').hidden=false;
    const fail=message=>{if(id!==job)return;endWorker();notice(message,true);$('progress').textContent='辨識未完成；原有結果保留，可重試或到校正頁手動輸入。';crop.width=1;crop.height=1;};
    timer=setTimeout(()=>fail('辨識等待超過 90 秒，已停止本次 Worker；不會自動反覆重抓。'),90000);
    worker.onerror=event=>fail('辨識模組錯誤：'+event.message);
    worker.onmessage=({data})=>{
        try {
            if(data.id!==job)return;
            if(data.type==='progress'){$('progress').textContent=data.message;return;}
            if(data.type==='error'){fail(data.message);return;}
            if(data.type==='result'){
                const next=data.rows.map(item=>({...newRow(item.raw),thumbnail:thumbnail(crop,item.box),predictions:item.predictions,uncertain:item.uncertain,reason:item.reason,modelHash:item.modelHash}));
                rows=next;endWorker();crop.width=1;crop.height=1;renderRows();save();tab('review');notice(`已解析 ${rows.length} 列。請逐列核對，再匯出。`);
                $('progress').textContent=`上次解析 ${rows.length} 列。`;
            }
        } catch(error) {fail(error.message||String(error));}
    };
    worker.postMessage({id,rgba:pixels.data,width:crop.width,height:crop.height,options:{rowCount:$('row-count').value,digitMode:$('digit-mode').value}},[pixels.data.buffer]);
});
$('add-row').onclick=()=>{if(rows.length>=100){notice('每批最多 100 列。',true);return;}rows.push(newRow());renderRows();save();$('rows').lastElementChild.querySelector('input').focus();};
$('confirm-valid').onclick=protect(async()=>{if(!rows.length)throw new Error('目前沒有結果。');if(!confirm('確認已對照原圖核對所有有效時間？此動作不是自動辨識驗證。'))return;for(const row of rows)if(parseTime(row.value).valid)await confirmRow(row);renderRows();save();});
function download(blob,name){const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
for(const format of ['txt','csv'])$(format).onclick=protect(async()=>{const text=exportTimes(rows,format);$('output').value=exportTimes(rows,'txt');download(new Blob([text],{type:format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'}),'Oc-Times.'+format);notice('已交給瀏覽器下載；原有草稿仍保留。');});
$('copy').onclick=protect(async()=>{const text=exportTimes(rows);$('output').value=text;try{await navigator.clipboard.writeText(text);notice('時間已複製。');}catch{$('output').focus();$('output').select();notice('剪貼簿未獲允許；請長按下面文字自行複製。',true);}});
async function refreshMetrics(){try{const data=await store.metrics();$('storage-status').textContent=`草稿 ${data.rows} 列 · 教材 ${data.samples} / 2,000 列 · 約 ${(data.bytes/1024).toFixed(1)} KB`; }catch(error){$('storage-status').textContent='讀取失敗：'+error.message;}}
$('export-training').onclick=protect(async()=>{
    const samples=await store.allSamples();if(!samples.length)throw new Error('尚未收集教材。先勾選收集字跡，再確認有原圖的時間列。');
    const {zipFiles}=await import('./zip.js?build=6ea10ff10bf7');
    const labels=[],files=[];
    samples.forEach((sample,index)=>{
        const name=`images/${String(index+1).padStart(6,'0')}.png`;
        if(!/^data:image\/png;base64,/.test(sample.image))throw new Error('教材圖片格式無效，已停止匯出。');
        files.push({name,data:Uint8Array.from(atob(sample.image.split(',')[1]),ch=>ch.charCodeAt(0))});
        const {image,...label}=sample;labels.push({...label,file:name});
    });
    files.push({name:'labels.json',data:JSON.stringify({schema:1,kind:'confirmed-four-digit-time-rows',samples:labels},null,2)});
    files.push({name:'README.txt',data:'Oc 人工確認的時間列教材。只含縮圖，不含原始整張照片。\n每列 time 為四位字串；未人工核對的單字切割不可直接當成數字標籤。\n此匯出不會自動訓練，也不會上傳 GitHub。\n'});
    download(zipFiles(files),'TimeOcrTraining.zip');notice('已匯出教材 ZIP。確認檔案可讀後，才自行決定是否清除教材。');
});
$('clear-training').onclick=protect(async()=>{if(!confirm('只清除此裝置的 Oc 教材？草稿與 StrForge 資料不動。'))return;await store.clearSamples();await refreshMetrics();notice('Oc 教材已清除。');});
$('clear-draft').onclick=protect(async()=>{if(!confirm('清除 Oc 校正草稿？教材與 StrForge 資料不動。'))return;await saving;await store.clearDraft();rows=[];renderRows();await refreshMetrics();notice('Oc 校正草稿已清除。');});
window.addEventListener('pagehide',()=>{job++;endWorker();});
try{
    const draft=await store.getState('draft');
    if(draft&&draft.schema!==1){storageSafe=false;throw new Error('保存資料版本較新；不覆蓋未知格式。');}
    if(draft){
        const valid=Array.isArray(draft.rows)&&draft.rows.length<=100&&draft.rows.every(row=>row&&typeof row.id==='string'&&typeof row.value==='string'&&typeof row.thumbnail==='string'&&typeof row.raw==='string'&&typeof row.reason==='string'&&Array.isArray(row.predictions)&&row.predictions.every(p=>p&&Number.isFinite(p.score)&&Number.isFinite(p.margin)&&Array.isArray(p.candidates)&&p.candidates.every(c=>Number.isInteger(c.digit)&&c.digit>=0&&c.digit<=9)));
        if(!valid){storageSafe=false;throw new Error('草稿格式無效，未自動清除。');}rows=draft.rows;
    }
}catch(error){storageSafe=false;notice('無法還原本機草稿：'+error.message+'。資料未被清除。',true);}
renderRows();
