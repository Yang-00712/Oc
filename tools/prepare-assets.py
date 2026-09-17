"""Promote only the pinned model artifact and resized user-supplied icon."""
import hashlib
import json
import pathlib
import shutil
import sys
from PIL import Image

source = pathlib.Path(sys.argv[1])
expected = 'cf9e67750cb57d02c0b0158d24a840c9d2d0a68b8492c732a9fda839ce1805cc'
raw = (source / 'time-digit.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == expected, 'Training artifact is not the reviewed model'
metrics = json.loads((source / 'training-metrics.json').read_text())
assert metrics['modelSha256'] == expected and metrics['testCount'] == 10000 and metrics['testAccuracy'] >= .97
for directory in ['models','assets','tests']:
    pathlib.Path(directory).mkdir(exist_ok=True)
for name, target in [('time-digit.json','models'),('training-metrics.json','models'),('golden.json','tests'),('demo-times.png','assets')]:
    shutil.copyfile(source / name, pathlib.Path(target) / name)
pathlib.Path('models/model.json').write_text(json.dumps({'schema':1,'file':'time-digit.json','sha256':expected,'dataset':'MNIST','personalized':False},indent=2)+'\n',encoding='utf-8')
with Image.open('assets/icon-source.jpg') as image:
    image.load()
    assert image.size == (256,256)
    for size,name in [(512,'icon-512.png'),(192,'icon-192.png'),(180,'apple-touch-icon.png')]:
        resized = image.convert('RGB').resize((size,size),Image.Resampling.LANCZOS)
        resized.quantize(colors=96).save(pathlib.Path('assets') / name, optimize=True)
print(json.dumps({'modelBytes':len(raw),'modelSha256':expected,'singleDigitMNISTTestAccuracy':metrics['testAccuracy'],'personalHandwritingEvaluated':False}))
