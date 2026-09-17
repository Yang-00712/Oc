"""Train a small ten-digit CNN; never read or upload a user's photographs.
Run on a PC or GitHub runner, NOT in the PWA. Exports weights, metrics and parity data.
"""
import argparse
import copy
import hashlib
import json
import pathlib
import time
import urllib.request

import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.nn import functional as F

class DigitCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 8, 5)
        self.conv2 = nn.Conv2d(8, 16, 5)
        self.fc = nn.Linear(16 * 4 * 4, 10)

    def forward(self, x):
        x = F.max_pool2d(F.relu(self.conv1(x)), 2)
        x = F.max_pool2d(F.relu(self.conv2(x)), 2)
        return self.fc(x.flatten(1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='model-build')
    parser.add_argument('--epochs', type=int, default=8)
    args = parser.parse_args()
    if not 1 <= args.epochs <= 20:
        raise ValueError('epochs must be between 1 and 20')
    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    torch.manual_seed(712)
    np.random.seed(712)
    url = 'https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz'
    with urllib.request.urlopen(url, timeout=90) as response:
        data = response.read(16000001)
    if len(data) > 16000000:
        raise ValueError('Unexpected dataset size')
    dataset_file = out / 'mnist.npz'
    dataset_file.write_bytes(data)
    dataset_hash = hashlib.sha256(data).hexdigest()
    with np.load(dataset_file, allow_pickle=False) as ds:
        train_x = torch.tensor(ds['x_train'][:, None], dtype=torch.float32) / 255
        train_y = torch.tensor(ds['y_train'], dtype=torch.long)
        test_x = torch.tensor(ds['x_test'][:, None], dtype=torch.float32) / 255
        test_y = torch.tensor(ds['y_test'], dtype=torch.long)
    assert train_x.shape == (60000, 1, 28, 28) and test_x.shape == (10000, 1, 28, 28)
    order = torch.randperm(60000)
    valid_x, valid_y = train_x[order[55000:]], train_y[order[55000:]]
    train_x, train_y = train_x[order[:55000]], train_y[order[:55000]]
    model = DigitCNN()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.003)
    history = []
    best_accuracy = -1
    started = time.monotonic()

    def evaluate(images, labels):
        model.eval()
        count = 0
        confusion = torch.zeros((10, 10), dtype=torch.int64)
        with torch.no_grad():
            for begin in range(0, len(images), 512):
                pred = model(images[begin:begin + 512]).argmax(1)
                expected = labels[begin:begin + 512]
                count += (pred == expected).sum().item()
                for e, p in zip(expected.tolist(), pred.tolist()):
                    confusion[e, p] += 1
        return count / len(images), confusion.tolist()

    for epoch in range(args.epochs):
        model.train()
        order = torch.randperm(len(train_x))
        total_loss = 0
        for begin in range(0, len(order), 128):
            ids = order[begin:begin + 128]
            images = train_x[ids]
            n = len(ids)
            angle = (torch.rand(n) - .5) * .25
            scale = .95 + torch.rand(n) * .10
            transform = torch.zeros(n, 2, 3)
            transform[:, 0, 0] = torch.cos(angle) * scale
            transform[:, 1, 1] = transform[:, 0, 0]
            transform[:, 0, 1] = -torch.sin(angle) * scale
            transform[:, 1, 0] = -transform[:, 0, 1]
            transform[:, :, 2] = (torch.rand(n, 2) - .5) * .10
            images = F.grid_sample(images, F.affine_grid(transform, images.size(), align_corners=False), align_corners=False)
            optimizer.zero_grad(set_to_none=True)
            loss = F.cross_entropy(model(images), train_y[ids])
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * n
        accuracy, _ = evaluate(valid_x, valid_y)
        history.append({'epoch': epoch + 1, 'trainLoss': total_loss / len(train_x), 'validationAccuracy': accuracy})
        print(json.dumps(history[-1]), flush=True)
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            best = copy.deepcopy(model.state_dict())
        if epoch == 4:
            for group in optimizer.param_groups:
                group['lr'] = .001
    model.load_state_dict(best)
    accuracy, confusion = evaluate(test_x, test_y)
    metrics = {'dataset': 'MNIST', 'datasetUrl': url, 'datasetSha256': dataset_hash,
               'trainCount': 55000, 'validationCount': 5000, 'testCount': 10000,
               'testAccuracy': accuracy, 'confusion': confusion, 'seed': 712,
               'epochs': args.epochs, 'history': history,
               'seconds': round(time.monotonic() - started, 2),
               'limitation': 'Single MNIST digits only. Not a measurement of user handwriting, photographed columns, row segmentation or four-digit time accuracy.'}
    weights = {name: {'shape': list(value.shape), 'data': [round(float(v), 7) for v in value.flatten()]}
               for name, value in model.state_dict().items()}
    document = {'schema': 1, 'architecture': 'conv8x5-pool2-conv16x5-pool2-fc10', 'input': [1, 28, 28],
                'normalization': 'white-ink-on-black, 0..1, centered 20px ink in 28px image', 'weights': weights}
    raw = json.dumps(document, separators=(',', ':')).encode()
    (out / 'time-digit.json').write_bytes(raw)
    metrics['modelSha256'] = hashlib.sha256(raw).hexdigest()
    metrics['modelBytes'] = len(raw)
    (out / 'training-metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    with torch.no_grad():
        logits = model(test_x[:32]).tolist()
    golden = [{'pixels': (test_x[i, 0].numpy() * 255).astype('uint8').flatten().tolist(),
               'label': int(test_y[i]), 'logits': logits[i]} for i in range(32)]
    (out / 'golden.json').write_text(json.dumps(golden, separators=(',', ':')), encoding='utf-8')
    targets = ['0900', '0910', '1002', '1004']
    paper = Image.new('L', (240, 340), 255)
    used = set()
    for row, text in enumerate(targets):
        for col, digit in enumerate(text):
            index = next(i for i in range(32, len(test_y)) if int(test_y[i]) == int(digit) and i not in used)
            used.add(index)
            image = Image.fromarray(255 - (test_x[index, 0].numpy() * 255).astype('uint8'))
            paper.paste(image.resize((48, 48)), (24 + col * 48, 28 + row * 76))
    paper.save(out / 'demo-times.png')
    dataset_file.unlink()
    print('METRICS ' + json.dumps({k: v for k, v in metrics.items() if k not in ('confusion', 'history')}), flush=True)
    if accuracy < .97:
        raise RuntimeError('MNIST test accuracy below 97%; do not promote this model')

if __name__ == '__main__':
    main()
