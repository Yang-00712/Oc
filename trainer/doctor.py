"""Readable dependency and model check; no changes to user data."""
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import torch
import numpy
import PIL
from trainer.model import load
ROOT=Path(__file__).resolve().parents[1]
print('Python:',sys.version.split()[0],platform.architecture()[0])
print('torch:',torch.__version__,'numpy:',numpy.__version__,'Pillow:',PIL.__version__)
node=shutil.which('node')
if not node:raise RuntimeError('Node.js 22+ not found.')
print('Node:',subprocess.check_output([node,'--version'],text=True).strip())
manifest=json.loads((ROOT/'models/model.json').read_text('utf-8'))
model,_=load(ROOT/'models/time-digit.json',manifest['sha256'])
with torch.no_grad():
 result=model(torch.zeros(1,1,28,28))
assert result.shape==(1,10) and torch.isfinite(result).all()
print('CPU tensor + Oc model hash/shape checks passed. No photo recognition claim.')
print('Model SHA256:',manifest['sha256'])
