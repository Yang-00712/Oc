// Content identifiers only; no product-version bump and no random cache-busting.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const catalog=JSON.parse(await readFile('models/local-engines.json','utf8'));
const catalogSource='// Generated from models/local-engines.json by tools/stamp.mjs. Do not edit.\nexport const LOCAL_ASSETS='+JSON.stringify(catalog)+';\n';
let catalogChanged=false;
try{catalogChanged=(await readFile('src/model-catalog.js','utf8'))!==catalogSource;}catch(error){if(error.code!=='ENOENT')throw error;catalogChanged=true;}
if(catalogChanged){if(process.argv.includes('--check'))throw new Error('Run node tools/stamp.mjs: catalog differs.');await writeFile('src/model-catalog.js',catalogSource);}
const files=(await readdir('src')).filter(name=>name.endsWith('.js')).sort();
const strip=text=>text.replace(/\?build=[a-f0-9]{12}/g,'');
const contents=await Promise.all(files.map(async name=>[name,strip(await readFile('src/'+name,'utf8'))]));
const css=await readFile('app.css','utf8');
const id=createHash('sha256').update(JSON.stringify(contents)+css).digest('hex').slice(0,12);
let changed=false;
for(const [name,text] of contents){
    const stamped=text.replace(/(['"])(\.\.?\/[^'"\s]+\.js)\1/g,(_,quote,path)=>quote+path+'?build='+id+quote);
    const old=await readFile('src/'+name,'utf8');
    if(old!==stamped){changed=true;if(!process.argv.includes('--check'))await writeFile('src/'+name,stamped);}
}
const original=await readFile('index.html','utf8');
const html=strip(original).replace('src="src/app.js"',`src="src/app.js?build=${id}"`).replace('href="app.css"',`href="app.css?build=${id}"`);
if(html!==original){changed=true;if(!process.argv.includes('--check'))await writeFile('index.html',html);}
console.log('CONTENT_ID='+id);
if(changed&&process.argv.includes('--check'))throw new Error('Run node tools/stamp.mjs before committing.');
