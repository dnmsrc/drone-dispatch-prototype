@echo off
title SkyShow Prototype - Start All
echo ============================================
echo   SkyShow Drone Dispatch - Prototype Dev
echo ============================================
echo.
echo Starting 3 windows: Mock Server / Admin / H5
echo.
start "Mock Server :8090" cmd /k "cd /d %~dp0mock-server && npm start"
timeout /t 2 >nul
start "Admin :8080" cmd /k "cd /d %~dp0admin && npm run dev"
start "H5 :5173" cmd /k "cd /d %~dp0h5 && npm run dev:h5"
echo.
echo   Mock Server  http://localhost:8090
echo   Admin        http://localhost:8080   (admin/admin123, operator/operator123)
echo   H5           http://localhost:5173   (mock WeChat login)
echo.
echo Note: all paths are ASCII now, no encoding issue.
pause
