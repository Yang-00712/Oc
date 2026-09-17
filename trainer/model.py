"""Strict weights-only JSON format, identical architecture to Oc/src/cnn.js."""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

ARCH = 'conv8x5-pool2-conv16x5-pool2-fc10'
SHAPES = {'conv1.weight': [8,1,5,5], 'conv1.bias': [8], 'conv2.weight': [16,8,5,5],
          'conv2.bias': [16], 'fc.weight': [10,256], 'fc.bias': [10]}

class DigitCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 8, 5)
        self.conv2 = nn.Conv2d(8, 16, 5)
        self.fc = nn.Linear(256, 10)
    def forward(self, x):
        x = F.max_pool2d(F.relu(self.conv1(x)), 2)
        x = F.max_pool2d(F.relu(self.conv2(x)), 2)
        return self.fc(x.flatten(1))


def load(path: Path, expected_hash: str | None = None):
    raw = path.read_bytes()
    if len(raw) > 1_000_000 or (expected_hash and hashlib.sha256(raw).hexdigest() != expected_hash):
        raise ValueError('模型容量或 SHA-256 不符，已停止。')
    doc = json.loads(raw)
    if doc.get('schema') != 1 or doc.get('architecture') != ARCH or doc.get('input') != [1,28,28]:
        raise ValueError('此工具只支援 Oc 現有十數字 CNN JSON 架構。')
    params = {}
    for name, shape in SHAPES.items():
        item = doc.get('weights', {}).get(name, {})
        values = np.asarray(item.get('data', []), dtype=np.float32)
        if item.get('shape') != shape or values.ndim != 1 or values.size != int(np.prod(shape)) or not np.isfinite(values).all() or (np.abs(values) > 1000).any():
            raise ValueError('模型權重格式不合法：' + name)
        params[name] = torch.from_numpy(values.reshape(shape).copy())
    model = DigitCNN()
    model.load_state_dict(params)
    model.eval()
    return model, doc


def export(model, template):
    doc = copy.deepcopy(template)
    doc['weights'] = {name: {'shape': list(value.shape), 'data': [round(float(v),7) for v in value.flatten()]}
                      for name,value in model.state_dict().items()}
    return json.dumps(doc, ensure_ascii=True, separators=(',', ':'), allow_nan=False).encode()


def evaluate(model, pixels, labels):
    if not len(labels):
        return None
    model.eval()
    confusion = np.zeros((10,10), dtype=np.int64)
    loss = 0.0
    with torch.no_grad():
        for start in range(0,len(labels),256):
            x = torch.as_tensor(pixels[start:start+256], dtype=torch.float32).reshape(-1,1,28,28) / 255
            y = torch.as_tensor(labels[start:start+256], dtype=torch.long)
            outputs = model(x)
            loss += float(F.cross_entropy(outputs,y,reduction='sum'))
            for expected, actual in zip(y.tolist(), outputs.argmax(1).tolist()):
                confusion[expected,actual] += 1
    correct = int(np.trace(confusion))
    return {'count': len(labels), 'correct': correct, 'accuracy': correct/len(labels),
            'loss': loss/len(labels), 'confusion': confusion.tolist()}
