"""Package this static project, excluding Git metadata, caches and user data."""
import pathlib
import zipfile

root = pathlib.Path('.')
files = [root / p for p in ['index.html','app.css','manifest.webmanifest','package.json','.nojekyll','.gitignore','README.md','AGENTS.md']]
for folder in ['src','models','vendor','downloads','assets','docs','tests','tools','.github']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc')
output = root / 'test-report'
output.mkdir(exist_ok=True)
with zipfile.ZipFile(output / 'Oc.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(set(files)):
        if path.is_file(): archive.write(path,path.as_posix())
print('Created test-report/Oc.zip')
