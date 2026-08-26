@echo off
cd /d "%~dp0"
echo Menjalankan server lokal IAST (terpisah dari iast.duckdns.org)...
echo Buka http://localhost:3000 di browser setelah "Ready" muncul.
echo Tutup jendela ini untuk mematikan server.
echo.
call pnpm dev
pause
