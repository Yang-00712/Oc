"""Acquire pinned public inference assets only. Never accepts images or user datasets."""
from pathlib import Path
import urllib.request, json, hashlib, base64, tarfile, io
import onnx
ROOT=Path(__file__).resolve().parents[1]
MODELS=[('ppocr-v5-en','en_PP-OCRv5_rec_mobile','PP-OCRv5','c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8'),('ppocr-v5-ch','ch_PP-OCRv5_rec_mobile','PP-OCRv5','5825fc7ebf84ae7a412be049820b4d86d77620f204a041697b0494669b1742c5'),('ppocr-v4-en','en_PP-OCRv4_rec_mobile','PP-OCRv4','e8770c967605983d1570cdf5352041dfb68fa0c21664f49f47b155abd3e0e318')]
def get(url,limit=60000000):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Oc-model-preparation'}),timeout=180) as r:data=r.read(limit+1)
    if len(data)>limit:raise ValueError('Download exceeds size limit: '+url)
    return data
def write(path,data):
    target=ROOT/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    return {'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
manifest={'schema':1,'runtimeVersion':'1.22.0','runtime':[],'models':{}}
metadata=json.loads(get('https://registry.npmjs.org/onnxruntime-web/1.22.0',200000))
archive=get(metadata['dist']['tarball'],100000000)
algorithm,expected=metadata['dist']['integrity'].split('-',1)
if algorithm!='sha512' or base64.b64encode(hashlib.sha512(archive).digest()).decode()!=expected:raise ValueError('npm integrity mismatch')
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
    for name in ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm']:
        data=tar.extractfile('package/dist/'+name).read();manifest['runtime'].append(write('vendor/ort/'+name,data))
    for name in ['LICENSE','ThirdPartyNotices.txt']:
        matches=[m for m in tar.getmembers() if m.name.endswith('/'+name)]
        if matches:write('vendor/ort/'+name,tar.extractfile(matches[0]).read())
for key,name,family,expected in MODELS:
    url=f'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/{family}/rec/{name}.onnx'
    data=get(url)
    if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Wrong model: '+key)
    record=write(f'models/{key}/model.onnx',data)
    model=onnx.load_model_from_string(data);meta={p.key:p.value for p in model.metadata_props}
    if 'character' not in meta:raise ValueError('Model has no alphabet: '+key)
    chars=['']+meta['character'].splitlines()+[' ']
    config={'schema':1,'id':key,'inputName':model.graph.input[0].name,'outputName':model.graph.output[0].name,'height':48,'width':320,'channels':'BGR','characters':chars,'source':url,'modelSha256':expected}
    config_record=write(f'models/{key}/config.json',(json.dumps(config,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    manifest['models'][key]={'files':[record,config_record],'bytes':record['bytes']+config_record['bytes'],'source':url,'license':'Apache-2.0'}
    print('MODEL',key,record['bytes'],'alphabet',len(chars),'input',config['inputName'],flush=True)
write('models/local-engines.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode())
write('models/PaddleOCR-LICENSE',get('https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/LICENSE',30000))
print('MODEL_ASSETS_READY',sum(x['bytes'] for x in manifest['runtime'])+sum(x['bytes'] for x in manifest['models'].values()))
