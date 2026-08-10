@echo off
start "" msedge.exe "edge://extensions/"
start "" explorer.exe "%~dp0"
echo Edge 扩展页面和插件目录已打开。
echo 请开启“开发人员模式” -^> “加载解压缩的扩展” -^> 选择当前文件夹。
pause
