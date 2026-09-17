import { parseTime, exportTimes, orderWarnings } from './time.js?build=26a84d591301';
import { decodePhoto, rotatedPhoto, cropPhoto, thumbnail } from './photo.js?build=26a84d591301';
import { ENGINES, engineById, selectedEngines, comparisonStats } from './engines.js?build=26a84d591301';
import { restoreDraft, snapshotDraft } from './multi-state.js?build=26a84d591301';
import * as store from './store.js?build=26a84d591301';

const $=id=>document.getElementById(id);
let installing=false,installJob=0,installController=null;
let rows=[], source=null, photo=null, roi={x:0,y:0,w:1,h:1},worker=null,job=0,timer=null,saving=Promise.resolve(),storageSafe=true;
let modelRuns=[],activeEngine=null,batchRunning=false,queueCancelled=false,rejectCurrent=null,assetController=null;
const node=(tag,text,css)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(css)item.className=css;return item;};
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function protect(action){return async event=>{try{await action(event);}catch(error){notice(error.message||String(error),true);}};}
function tab(name){
    if(batchRunning&&name!=='scan'){notice('辨識仍在依序執行；可按取消，已完成結果會保留。',true);return;}
    for(const page of document.querySelectorAll('.page'))page.hidden=page.id!==name;
    for(const button of document.querySelectorAll('[data-tab]')){if(button.dataset.tab===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
    if(name==='settings') void refreshMetrics();
    window.scrollTo(0,0);
}
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>tab(button.dataset.tab);
function newRow(value=''){return {id:crypto.randomUUID(),value,raw:value,confirmed:false,thumbnail:'',predictions:[],uncertain:false,reason:'人工輸入',modelHash:null};}
function save(){
    if(!storageSafe){$('save-status').textContent='儲存不可用；目前只保留在這次畫面。請匯出後再關閉。';return;}
    const snapshot=snapshotDraft(rows,modelRuns,activeEngine);
    $('save-status').textContent='正在保存本機草稿…';
    saving=saving.catch(()=>{}).then(()=>store.setState('draft',snapshot)).then(()=>{$('save-status').textContent='已保存本機草稿（不含整張照片）。';}).catch(error=>{
        $('save-status').textContent='保存失敗：'+error.message+'。請勿關閉，先匯出。';notice('本機草稿保存失敗；沒有回報成功。',true);
    });
}
function updateCounter(){
    syncActive();renderModelTabs();
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
        const details=node('details'),summary=node('summary','原始辨識與候選');details.append(summary,node('p','','row-message'));
        element.append(head,edit,details);
        if(row.predictions.length===4){
            const choices=node('div',undefined,'predictions');
            row.predictions.forEach((prediction,position)=>{if(prediction.score<.9||prediction.margin<.25){
                for(const candidate of prediction.candidates.slice(0,2)){
                    const button=node('button',`第${position+1}位 → ${candidate.digit}`);button.type='button';
                    button.onclick=()=>{const raw=row.value.replace(':','');if(!/^\d{4}$/.test(raw)){notice('先填齊四位數字，再替換候選。',true);return;}
                        row.value=raw.slice(0,position)+candidate.digit+raw.slice(position+1);row.confirmed=false;input.value=row.value;invalidateSample(row);refreshRow(row,element,index);save();};choices.append(button);
                }
            }});details.append(choices);
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
$('photo-canvas').onpointerdown=event=>{if(batchRunning)return;start=point(event);event.currentTarget.setPointerCapture(event.pointerId);};
$('photo-canvas').onpointermove=event=>{if(!start)return;const end=point(event);roi={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(start.x-end.x),h:Math.abs(start.y-end.y)};draw();};
$('photo-canvas').onpointerup=()=>{start=null;};$('photo-canvas').onpointercancel=()=>{start=null;};
for(const key of ['x','y','w','h'])$('roi-'+key).onchange=()=>{
    const next={};for(const k of ['x','y','w','h'])next[k]=Number($('roi-'+k).value)/100;
    if(!validRoi(next)){notice('框選座標超出照片，請調整。',true);draw();return;}
    roi=next;draw();
};
async function setPhoto(file){
    if(batchRunning)throw new Error('請先取消目前辨識。');
    const decoded=await decodePhoto(file);if(source){source.width=1;source.height=1;}if(photo&&photo!==source){photo.width=1;photo.height=1;}
    source=decoded;photo=source;roi={x:0,y:0,w:1,h:1};$('angle').value=0;$('angle-value').value='0°';$('photo-empty').hidden=true;$('photo-editor').hidden=false;$('recognize').disabled=installing;draw();
    notice('已載入照片。請框住時間欄；原照不會上傳或保存。');
}
for(const id of ['camera','photo'])$(id).onchange=protect(async event=>{const file=event.target.files?.[0];if(file)await setPhoto(file);event.target.value='';});
$('angle').oninput=()=>{if(!source||batchRunning)return;const angle=Number($('angle').value);$('angle-value').value=angle+'°';if(photo!==source){photo.width=1;photo.height=1;}photo=rotatedPhoto(source,angle);draw();};
$('full-frame').onclick=()=>{if(!batchRunning){roi={x:0,y:0,w:1,h:1};draw();}};
$('save-template').onclick=protect(async()=>{if(!validRoi(roi))throw new Error('請先框選有效範圍。');await store.setState('template',{schema:1,roi});notice('已記住比例範圍；每張照片仍需核對框位。');});
$('use-template').onclick=protect(async()=>{if(batchRunning)return;const template=await store.getState('template');if(template?.schema!==1||!validRoi(template.roi))throw new Error('尚未記住有效範圍。');roi=template.roi;draw();notice('已套用比例範圍；拍攝角度或距離不同時請重新調整。');});
$('demo').onclick=protect(async()=>{const response=await fetch(new URL('../assets/demo-times.png',import.meta.url));if(!response.ok)throw new Error('示例載入失敗。');await setPhoto(new File([await response.blob()],'demo.png',{type:'image/png'}));notice('這是 MNIST 手寫數字組成的示例，不是你的字跡或實拍準確率。');});
function syncActive(){const current=modelRuns.find(r=>r.engine===activeEngine);if(current)current.rows=rows;}
function renderModelTabs(){
    const host=$('model-results');if(!host)return;host.replaceChildren();
    for(const run of modelRuns){
        const stats=comparisonStats(run.rows),name=engineById(run.engine)?.name||'先前草稿';
        const button=node('button',name,'result-tab');button.type='button';button.dataset.engine=run.engine;
        if(run.engine===activeEngine)button.setAttribute('aria-pressed','true');else button.setAttribute('aria-pressed','false');
        button.disabled=run.status!=='ready';
        button.append(node('small',run.status==='ready'?`${stats.total} 列 · 已確認 ${stats.confirmed} · 修改 ${stats.edited} · ${(run.elapsedMs/1000).toFixed(1)} 秒`:(run.error||run.status)));
        button.onclick=()=>{syncActive();activeEngine=run.engine;rows=run.rows;renderRows();save();$('output').value='';};host.append(button);
    }
}
for(const engine of ENGINES){
    const label=node('label',undefined,'engine-option'),input=node('input');input.type='checkbox';input.value=engine.id;input.name='engine';input.checked=engine.id==='cnn';input.onchange=protect(async()=>{await store.setState('engine-selection',{schema:1,ids:[...document.querySelectorAll('input[name=engine]:checked')].map(i=>i.value)});});
    const text=node('span');text.append(node('strong',engine.name),node('small',engine.description));label.append(input,text);$('engine-options').append(label);
}
function endWorker(){clearTimeout(timer);assetController?.abort();assetController=null;worker?.terminate();worker=null;rejectCurrent=null;}
function cancelBatch(){queueCancelled=true;job++;const reject=rejectCurrent;endWorker();if(reject)reject(new Error('已取消此模型。'));}
$('cancel').onclick=()=>{cancelBatch();$('progress').textContent='已取消；已完成的模型與原草稿保留。';};
function runEngine(engine,pixels,crop,options){
    const id=++job;
    return new Promise((resolve,reject)=>{
        let settled=false;
        rejectCurrent=reject;
        const finish=(value,error)=>{if(id!==job||settled)return;settled=true;endWorker();if(error)reject(new Error(error));else resolve(value);};
        const progress=message=>{if(id===job&&!settled)$('progress').textContent=engine.name+'：'+message;};
        // Download/install has its own budget; the four-minute inference timer
        // starts only AFTER the model and runtime bytes have been acquired.
        void (async()=>{
            let assets;
            if(engine.kind==='line'){
                assetController=new AbortController();const signal=assetController.signal;
                const {loadEngineAssets}=await import('./engine-assets.js?build=26a84d591301');
                if(id!==job||settled)return;
                const {withAssetBudget}=await import('./asset-download.js?build=26a84d591301');
                assets=await withAssetBudget(()=>loadEngineAssets(engine.id,progress,signal),assetController);
                if(id!==job||settled)return;
            }
            timer=setTimeout(()=>finish(null,'模型已準備，但初始化／辨識超過 4 分鐘，已停止；已安裝檔案與其他結果保留。'),240000);
            worker=new Worker(new URL(engine.id==='cnn'?'./ocr-worker.js?build=26a84d591301':'./line-worker.js?build=26a84d591301',import.meta.url),{type:'module'});
            worker.onerror=event=>finish(null,'辨識模組錯誤：'+event.message);
            worker.onmessage=({data})=>{
                if(data.id!==job||settled)return;
                if(data.type==='progress'){progress(data.message);return;}
                if(data.type==='error'){finish(null,data.message);return;}
                if(data.type==='result')finish(data);
            };
            const copy=pixels.data.slice(),transfers=[copy.buffer];
            if(assets)transfers.push(assets.weights,...Object.values(assets.runtime));
            worker.postMessage({id,engine:engine.id,rgba:copy,width:crop.width,height:crop.height,options,assets},transfers);
        })().catch(error=>finish(null,String(error.message||error)));
    });
}
$('recognize').onclick=protect(async()=>{
    if(installing)throw new Error('請等模型準備完成，或先取消準備。');
    if(batchRunning||!photo)return;
    const selected=selectedEngines([...document.querySelectorAll('input[name=engine]:checked')].map(i=>i.value));
    if(rows.length&&!confirm('新辨識成功後會替換這張照片的模型比較結果。舊結果需要保留時請先匯出。繼續？'))return;
    const crop=cropPhoto(photo,roi),pixels=crop.getContext('2d').getImageData(0,0,crop.width,crop.height);
    const options={rowCount:$('row-count').value,digitMode:$('digit-mode').value};
    const completed=[];let hasSuccess=false;
    batchRunning=true;queueCancelled=false;$('recognize').disabled=true;$('cancel').hidden=false;
    for(const input of document.querySelectorAll('input[name=engine]'))input.disabled=true;
    try{
        for(const engine of selected){
            if(queueCancelled)break;
            const started=performance.now();
            try{
                const data=await runEngine(engine,pixels,crop,options);
                const next=data.rows.map(item=>({...newRow(item.raw),thumbnail:thumbnail(crop,item.box),transcript:item.transcript??item.raw,predictions:item.predictions,uncertain:item.uncertain,reason:item.reason,modelHash:item.modelHash}));
                completed.push({engine:engine.id,rows:next,status:'ready',elapsedMs:performance.now()-started,error:''});
                if(!hasSuccess){hasSuccess=true;activeEngine=engine.id;rows=next;}
            }catch(error){completed.push({engine:engine.id,rows:[],status:queueCancelled?'cancelled':'error',elapsedMs:performance.now()-started,error:String(error.message||error)});}
            if(hasSuccess){syncActive();modelRuns=completed;renderRows();save();}
        }
        if(hasSuccess){batchRunning=false;tab('review');notice(`完成 ${completed.filter(r=>r.status==='ready').length} / ${selected.length} 個模型。點模型名稱，各自核對與匯出；結果互不覆蓋。`);}
        else notice(completed.map(r=>`${engineById(r.engine)?.name}：${r.error}`).join('；')||'辨識取消；原草稿保留。',true);
    }finally{
        endWorker();batchRunning=false;crop.width=1;crop.height=1;$('recognize').disabled=!photo;$('cancel').hidden=true;
        for(const input of document.querySelectorAll('input[name=engine]'))input.disabled=false;
        $('progress').textContent=queueCancelled?'已取消；已完成結果保留。':`完成 ${completed.filter(r=>r.status==='ready').length} / ${selected.length} 個模型。各模型耗時包含首次下載。`;
    }
});
function installationProgress(message,error=false){
    for(const id of ['install-status','install-scan-status']){$(id).textContent=message;$(id).classList.toggle('error',error);}
}
function installControls(busy){
    installing=busy;
    for(const input of document.querySelectorAll('[data-model-action],#model-package,#install-selected'))input.disabled=busy;
    $('cancel-install').hidden=!busy;$('recognize').disabled=busy||batchRunning||!photo;
}
async function showModelStorage(){
    const {modelStorage,clearModel}=await import('./engine-assets.js?build=26a84d591301'),info=await modelStorage(),host=$('model-storage');host.replaceChildren();
    host.append(node('p',`共用引擎 ${(info.runtimeBytes/1048576).toFixed(1)} MiB · ${info.runtimeInstalled?'已完整保存':'尚未完整保存'}（${(info.runtimeSaved/1048576).toFixed(1)} MiB；非 RAM）。`));
    for(const item of info.items){
        const line=node('div',undefined,'model-storage-line');
        line.append(node('span',`${engineById(item.id)?.name}：${(item.bytes/1048576).toFixed(1)} MiB · ${item.installed?'已下載保存':'尚未完整下載'} · ${item.ready?'可辨識':'仍需準備'}`));
        const install=node('button',item.ready?'檢查已安裝檔案':'下載並保存');install.type='button';install.dataset.modelAction='install';install.dataset.modelId=item.id;install.disabled=installing;
        install.onclick=()=>void prepareModels([item.id]);
        const clear=node('button','移除這個模型快取');clear.type='button';clear.dataset.modelAction='clear';clear.disabled=installing;
        clear.onclick=protect(async()=>{
            if(batchRunning||installing)throw new Error('請等目前操作完成或先取消。');
            if(!confirm('只移除此模型的已下載權重？共用引擎、校正結果與教材不動。'))return;
            await clearModel(item.id);await showModelStorage();
        });line.append(install,clear);host.append(line);
    }
}
async function runInstallation(action){
    if(batchRunning||installing){notice('請等目前辨識／模型準備完成，或先取消。',true);return;}
    const id=++installJob,controller=new AbortController();installController=controller;installControls(true);
    const report=(message,error=false)=>{if(id===installJob)installationProgress(message,error);};
    report('準備模型檔案；下載不占用四分鐘辨識時間，照片不會上傳。');
    try{
        const {withAssetBudget}=await import('./asset-download.js?build=26a84d591301');
        await withAssetBudget(signal=>action(report,signal),controller);
        if(id===installJob)notice('模型準備完成，可回掃描頁勾選並辨識。');
    }catch(error){if(id===installJob){report(error.message||String(error),true);notice(error.message||String(error),true);}}
    finally{
        if(id===installJob){installController=null;installControls(false);await showModelStorage().catch(error=>report('容量讀取失敗：'+error.message,true));}
    }
}
async function prepareModels(ids){
    const names=ids.filter(id=>engineById(id)?.kind==='line');
    if(!names.length){installationProgress('小型 CNN 不需要大型安裝包；直接選照片辨識即可。');return;}
    await runInstallation(async(report,signal)=>{
        const {prepareEngine}=await import('./engine-assets.js?build=26a84d591301');
        for(const id of names)await prepareEngine(id,message=>report(`${engineById(id).name}：${message}`),signal);
        report(`已完整保存 ${names.length} 個模型與共用引擎；可開始辨識。`);
    });
}
$('show-model-storage').onclick=protect(async()=>{if(batchRunning)throw new Error('請等辨識完成或先取消。');await showModelStorage();});
$('open-model-settings').onclick=()=>{tab('settings');void showModelStorage().catch(error=>notice(error.message,true));};
$('install-selected').onclick=()=>void prepareModels([...document.querySelectorAll('input[name=engine]:checked')].map(input=>input.value));
$('cancel-install').onclick=()=>installController?.abort(new Error('已取消模型準備；完整存好的檔案與原草稿保留。'));
$('model-package').onchange=protect(async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    await runInstallation(async(report,signal)=>{const {importModelPack}=await import('./model-pack.js?build=26a84d591301');await importModelPack(file,report,signal);});
});
$('add-row').onclick=()=>{if(rows.length>=100){notice('每批最多 100 列。',true);return;}rows.push(newRow());renderRows();save();$('rows').lastElementChild.querySelector('input').focus();};
$('confirm-valid').onclick=protect(async()=>{if(!rows.length)throw new Error('目前沒有結果。');if(!confirm('確認已對照原圖核對所有有效時間？此動作不是自動辨識驗證。'))return;for(const row of rows)if(parseTime(row.value).valid)await confirmRow(row);renderRows();save();});
function download(blob,name){const url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
for(const format of ['txt','csv'])$(format).onclick=protect(async()=>{const text=exportTimes(rows,format);$('output').value=exportTimes(rows,'txt');download(new Blob([text],{type:format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'}),'Oc-Times'+(activeEngine&&activeEngine!=='legacy'?'-'+activeEngine:'')+'.'+format);notice('已交給瀏覽器下載；原有草稿仍保留。');});
$('copy').onclick=protect(async()=>{const text=exportTimes(rows);$('output').value=text;try{await navigator.clipboard.writeText(text);notice('時間已複製。');}catch{$('output').focus();$('output').select();notice('剪貼簿未獲允許；請長按下面文字自行複製。',true);}});
async function refreshMetrics(){try{const data=await store.metrics();$('storage-status').textContent=`草稿 ${data.rows} 列 · 教材 ${data.samples} / 2,000 列 · 約 ${(data.bytes/1024).toFixed(1)} KB`; }catch(error){$('storage-status').textContent='讀取失敗：'+error.message;}}
$('export-training').onclick=protect(async()=>{
    const samples=await store.allSamples();if(!samples.length)throw new Error('尚未收集教材。先勾選收集字跡，再確認有原圖的時間列。');
    const {zipFiles}=await import('./zip.js?build=26a84d591301');
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
$('clear-draft').onclick=protect(async()=>{if(batchRunning)throw new Error('請先取消辨識。');if(!confirm('清除 Oc 校正草稿？教材與 StrForge 資料不動。'))return;await saving;await store.clearDraft();rows=[];modelRuns=[];activeEngine=null;renderRows();await refreshMetrics();notice('Oc 校正草稿已清除。');});
window.addEventListener('pagehide',()=>{cancelBatch();installController?.abort(new Error('畫面已關閉；已存模型檔案與草稿保留。'));});
try{
    const draft=await store.getState('draft');
    const restored=restoreDraft(draft);rows=restored.rows;modelRuns=restored.runs;activeEngine=restored.activeEngine;
}catch(error){storageSafe=false;notice('無法還原本機草稿：'+error.message+'。資料未被清除。',true);}
renderRows();

try{const choice=await store.getState('engine-selection');if(choice?.schema===1&&Array.isArray(choice.ids)&&choice.ids.every(id=>engineById(id)))for(const input of document.querySelectorAll('input[name=engine]'))input.checked=choice.ids.includes(input.value);}catch{ /* Core draft restore already reports storage restrictions. */ }
