// Check only the small app entry. Model files and saved user data are untouched.
const BUILD=/^[a-f0-9]{12}$/;
export function updateUrl(href,build){
    if(!BUILD.test(build))throw new Error('更新識別碼無效。');
    const url=new URL(href);url.searchParams.set('oc-build',build);return url.href;
}
export function readBuild(doc){
    const build=doc.querySelector('meta[name="oc-build"]')?.content;
    const script=doc.querySelector('script[type="module"][src^="src/app.js"]')?.getAttribute('src');
    if(!BUILD.test(build||'')||script!=='src/app.js?build='+build)throw new Error('網站正在更新，請稍後再檢查。');
    return build;
}
export function startUpdates({canAutoReload,blockReload,prepareReload}){
    const $=id=>document.getElementById(id),current=readBuild(document);
    const entry=new URL('../index.html',import.meta.url),attemptKey='oc-update-attempt';
    let latest=null,inflight=null,applying=false,lastCheck=-Infinity;
    $('app-build').textContent=current;
    const status=text=>{$('update-status').textContent=text;};
    const available=()=>{
        $('update-banner').hidden=false;$('apply-update').hidden=false;
        $('update-message').textContent='Oc 有新版可用。先保存校正草稿，再更新畫面。';
        status('找到新版，可按「更新並保留資料」。');
    };
    async function apply(manual=false){
        if(!latest||applying)return;
        const blocked=blockReload();
        if(blocked){status(blocked);return;}
        if(!manual&&!canAutoReload()){available();return;}
        if(manual&&!confirm('更新並保留已保存的草稿、教材與模型？目前照片不會保存，更新後需重新選取。'))return;
        applying=true;
        // Keep input stable while the last IndexedDB transaction completes.
        const main=document.querySelector('main'),nav=document.querySelector('nav');
        main.inert=true;nav.inert=true;document.activeElement?.blur();
        try{
            await prepareReload();
            const reason=blockReload();if(reason)throw new Error(reason);
            if(document.visibilityState!=='visible')throw new Error('回到 Oc 後再更新。');
            let attempted=false,recorded=false;
            try{attempted=sessionStorage.getItem(attemptKey)===latest;sessionStorage.setItem(attemptKey,latest);recorded=true;}catch{}
            const sameTarget=new URL(location.href).searchParams.get('oc-build')===latest;
            if(!manual&&(!recorded||attempted||sameTarget)){
                available();status('新版已找到，請按「更新並保留資料」；不會反覆自動重載。');return;
            }
            status('草稿已保存，正在更新畫面…');
            location.replace(updateUrl(location.href,latest));
        }catch(error){status('尚未更新：'+(error.message||String(error)));}
        finally{applying=false;main.inert=false;nav.inert=false;}
    }
    async function check(manual=false){
        if(applying||document.visibilityState!=='visible')return;
        if(inflight)return inflight;
        if(!manual&&performance.now()-lastCheck<30000)return;
        lastCheck=performance.now();$('check-update').disabled=true;
        status('正在檢查更新…');
        inflight=(async()=>{
            const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
            try{
                const response=await fetch(entry,{cache:'no-cache',signal:controller.signal,credentials:'same-origin'});
                if(!response.ok)throw new Error('HTTP '+response.status);
                const remote=readBuild(new DOMParser().parseFromString(await response.text(),'text/html'));
                if(remote===current){
                    latest=null;$('update-banner').hidden=true;$('apply-update').hidden=true;
                    status('目前已是最新版。');
                    try{if(sessionStorage.getItem(attemptKey)===current)sessionStorage.removeItem(attemptKey);}catch{}
                }else{
                    latest=remote;available();
                    if(!manual&&canAutoReload())await apply();
                }
            }catch{
                status('暫時無法檢查更新；目前畫面與資料保留，連線後可再按檢查。');
            }finally{clearTimeout(timeout);$('check-update').disabled=false;inflight=null;}
        })();
        return inflight;
    }
    $('check-update').onclick=()=>void check(true);
    $('apply-update').onclick=$('apply-update-banner').onclick=()=>void apply(true);
    const resume=()=>{if(document.visibilityState==='visible')void check();};
    window.addEventListener('pageshow',resume);
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',resume);
    void check();
}
