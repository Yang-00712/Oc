@echo off
setlocal DisableDelayedExpansion
cd /d "%~dp0"
set "PYTHONUTF8=1"
py -3.13 -c "import sys;assert sys.maxsize>2**32" >nul 2>&1
if not errorlevel 1 goto PY313
py -3.12 -c "import sys;assert sys.maxsize>2**32" >nul 2>&1
if not errorlevel 1 goto PY312
python -c "import sys;assert sys.version_info[:2] in [(3,12),(3,13)] and sys.maxsize>2**32" >nul 2>&1
if not errorlevel 1 goto PYDEFAULT
echo Python 3.13 x64 was not found. Install it from https://www.python.org/downloads/windows/
echo Then close this window and run Setup.cmd again. See START_HERE.html.
if "%~1"=="" pause
exit /b 1
:PY313
py -3.13 trainer\setup.py %*
goto DONE
:PY312
py -3.12 trainer\setup.py %*
goto DONE
:PYDEFAULT
python trainer\setup.py %*
:DONE
set "RESULT=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %RESULT%
