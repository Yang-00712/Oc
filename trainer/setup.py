"""Install into this folder's .venv only. No administrator or PowerShell policy changes."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import venv

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--yes',action='store_true')
    parser.add_argument('--skip-reference',action='store_true')
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if sys.version_info[:2] not in ((3,12),(3,13)) or platform.architecture()[0]!='64bit':
        raise RuntimeError('Use standard 64-bit Python 3.13.x (or 3.12.x), not 32-bit/free-threaded Python.')
    node=shutil.which('node')
    if not node:
        raise RuntimeError('Node.js 22+ is required for Oc model parity checks. Install Node.js, reopen the terminal, then retry.')
    result=subprocess.run([node,'--version'],check=True,capture_output=True,text=True)
    if int(re.search(r'v(\d+)',result.stdout).group(1))<22:
        raise RuntimeError('Node.js 22 or later is required.')
    env=ROOT/'.venv';python=env/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if args.check:
        if not python.exists():raise RuntimeError('No .venv yet. Run Setup.cmd first.')
        subprocess.run([str(python),'-m','trainer.doctor'],cwd=ROOT,check=True);return
    print('This installs CPU PyTorch 2.10.0, NumPy 2.3.5 and Pillow 12.3.0 into .venv only.')
    print('First setup requires Internet. No photos/datasets are uploaded. No .NET/CUDA required.')
    print('Location: '+str(env))
    if not args.yes and input('Type INSTALL to continue: ').strip()!='INSTALL':
        print('Cancelled.');return
    if env.exists() and not (env/'pyvenv.cfg').is_file():
        raise RuntimeError('.venv exists but is not a virtual environment. It was not overwritten.')
    if not python.exists():venv.EnvBuilder(with_pip=True).create(env)
    commands=[
        [str(python),'-m','pip','install','--disable-pip-version-check','--only-binary=:all:','-r',str(ROOT/'trainer/requirements.txt')],
        [str(python),'-m','pip','install','--disable-pip-version-check','--only-binary=:all:','torch==2.10.0','--index-url','https://download.pytorch.org/whl/cpu'],
        [str(python),'-m','trainer.doctor'],
    ]
    if not args.skip_reference:commands.append([str(python),'-m','trainer.reference_cli','--data-dir',str(default_home())])
    for command in commands:subprocess.run(command,cwd=ROOT,check=True)
    print('READY. Run Start-Trainer.cmd. A later browser launch needs no setup rerun.')


def default_home():
    if os.name=='nt':return Path(os.environ.get('LOCALAPPDATA',Path.home()))/'OcTrainer'
    return Path(os.environ.get('XDG_DATA_HOME',Path.home()/'.local/share'))/'OcTrainer'

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('\nSETUP FAILED: '+str(error),file=sys.stderr);sys.exit(1)
