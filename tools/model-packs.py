"""Build import-only public model ZIPs. No photos, drafts, fonts, or training data.
ZIP_STORED permits bounded per-file reads on iOS without an unzip dependency.
"""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / 'models/local-engines.json').read_text(encoding='utf-8'))
output = root / 'test-report' / 'model-packs'
output.mkdir(parents=True, exist_ok=True)
sets = {
    'Oc-Models.zip': list(catalog['models']),
    'Oc-PP-OCRv5-General.zip': ['ppocr-v5-ch'],
}
for name, ids in sets.items():
    files = catalog['runtime'] + [f for model in ids for f in catalog['models'][model]['files']]
    entries = {}
    for item in files:
        content = (root / item['path']).read_bytes()
        if len(content) != item['bytes'] or hashlib.sha256(content).hexdigest() != item['sha256']:
            raise ValueError('Pinned asset mismatch: ' + item['path'])
        entries[item['path']] = content
    entries['oc-model-pack.json'] = json.dumps({'schema': 1, 'kind': 'oc-public-model-pack', 'runtimeVersion': catalog['runtimeVersion'], 'models': ids}, ensure_ascii=False).encode('utf-8')
    entries['README.txt'] = ('Oc 公開預訓練模型包，不是教材或原始碼。\r\n'
        '下載並保存在 iPhone「檔案」，不用解壓。\r\n'
        '從平常使用的 Oc 主畫面圖示開啟，設定 → 匯入模型 ZIP → 選此檔。\r\n'
        '等模型與共用引擎均顯示完整保存，再回掃描頁勾選模型辨識。\r\n'
        'Safari 和主畫面入口的網站保存區可能不同，請在要使用的入口匯入。\r\n'
        '只含已公開權重與 ONNX Runtime 1.22.0；不含照片、私人教材、字型或金鑰。\r\n'
        '網站會核對固定 SHA-256；不要修改 ZIP 內容或重新壓縮。\r\n').encode('utf-8')
    for license_path in ['models/PaddleOCR-LICENSE', 'vendor/ort/LICENSE']:
        entries[license_path] = (root / license_path).read_bytes()
    with zipfile.ZipFile(output / name, 'w', compression=zipfile.ZIP_STORED) as z:
        for path, content in sorted(entries.items()):
            info = zipfile.ZipInfo(path, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED
            z.writestr(info, content)
    package = output / name
    with zipfile.ZipFile(package) as z:
        if z.testzip() is not None:
            raise ValueError('Invalid bundle')
    print(json.dumps({'file': str(package.relative_to(root)), 'bytes': package.stat().st_size, 'sha256': hashlib.sha256(package.read_bytes()).hexdigest()}))
