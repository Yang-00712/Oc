// Bounded streaming download. One request; no automatic short-timeout retries.
export const ASSET_DOWNLOAD_LIMIT_MS = 15 * 60 * 1000;
export function checkCancelled(signal) {
 if (signal?.aborted) throw signal.reason || new Error('模型準備已取消。');
}
const mb = n => (n / 1048576).toFixed(2);
export async function downloadAsset(url, asset, notify = () => {}, signal) {
 checkCancelled(signal);
 let received = 0, reader, lastNotice = 0;
 const report = force => {
  const now = Date.now();
  if (force || now - lastNotice >= 200) {
   lastNotice = now;
   notify(`下載 ${asset.path}：${mb(received)} / ${mb(asset.bytes)} MiB（${Math.floor(received / asset.bytes * 100)}%）`);
  }
 };
 report(true);
 try {
  const response = await fetch(url, { credentials:'same-origin', signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // Body streams contain decoded bytes. Use the trusted manifest, not the wire
  // Content-Length (which may describe a compressed response), for progress.
  const bytes = new Uint8Array(asset.bytes);
  if (response.body) {
   reader = response.body.getReader();
   for (;;) {
    checkCancelled(signal);
    const { value, done } = await reader.read();
    checkCancelled(signal);
    if (done) break;
    if (received + value.byteLength > bytes.byteLength) throw new Error('檔案超出宣告大小');
    bytes.set(value, received); received += value.byteLength; report(false);
   }
  } else {
   const value = new Uint8Array(await response.arrayBuffer());
   checkCancelled(signal);
   if (value.byteLength > bytes.byteLength) throw new Error('檔案超出宣告大小');
   bytes.set(value); received = value.byteLength;
  }
  if (received !== asset.bytes) throw new Error('檔案未下載完整');
  report(true); return bytes.buffer;
 } catch (cause) {
  if (signal?.aborted) throw signal.reason || cause;
  throw new Error(`下載失敗：${asset.path}（${mb(received)} / ${mb(asset.bytes)} MiB）：${cause.message || cause}。已存好的檔案保留；可重試準備，或在設定匯入模型 ZIP。`, { cause });
 } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
}
// One bounded preparation operation. Cancellation/expiry releases the UI even
// when a browser fails to settle an aborted fetch; it never starts a second fetch.
export async function withAssetBudget(action,controller,limitMs=ASSET_DOWNLOAD_LIMIT_MS){
 checkCancelled(controller.signal);
 let timer,onAbort;
 const cancelled=new Promise((_,reject)=>{
  onAbort=()=>reject(controller.signal.reason||new Error('模型準備已取消。'));
  controller.signal.addEventListener('abort',onAbort,{once:true});
  timer=setTimeout(()=>controller.abort(new Error('模型準備已達 15 分鐘；已存檔案保留。可改用匯入模型 ZIP，不必清草稿。')),limitMs);
 });
 try{return await Promise.race([Promise.resolve().then(()=>{checkCancelled(controller.signal);return action(controller.signal);}),cancelled]);}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);}
}
