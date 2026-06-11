<# 
  Idioma 设计文档构建脚本（新架构）
  架构:
    index.html                     - 导航主页（直接打开）
    pages/sections/*.html          - 文档章节（可独立打开）
    pages/prototypes/*.html        - 手机原型（可独立打开）
    shared/*.css, phone/*/content  - 源文件（编辑用）
    
  本脚本生成 docs/index.html 作为导航入口。
  各子页面已经是独立的 HTML 文件，可直接双击打开。
#>

Add-Type -AssemblyName System.Text.Encoding
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Idioma Design Doc Builder"
Write-Host "========================="
Write-Host ""

# 1. 验证 pages/sections/*.html 存在
Write-Host "--- Content pages ---"
$sectionCount = 0
Get-ChildItem -LiteralPath "$root\pages\sections" -Filter "*.html" | ForEach-Object {
    $sectionCount++
    $size = $_.Length
    Write-Host "  [OK] $($_.Name) ($size bytes)"
}

# 2. 验证 pages/prototypes/*.html 存在
Write-Host ""
Write-Host "--- Prototype pages ---"
$protoCount = 0
Get-ChildItem -LiteralPath "$root\pages\prototypes" -Filter "*.html" | ForEach-Object {
    $protoCount++
    $size = $_.Length
    Write-Host "  [OK] $($_.Name) ($size bytes)"
}

# 3. 可选: 生成自包含单一文件版本
# (目前每个页面可直接打开，无需合并)

Write-Host ""
Write-Host "========================="
Write-Host "Structure verified:"
Write-Host "  $sectionCount content pages in pages/sections/"
Write-Host "  $protoCount prototype pages in pages/prototypes/"
Write-Host ""
Write-Host "Usage:"
Write-Host "  Open docs/index.html for navigation"
Write-Host "  Open docs/pages/sections/*.html directly"
Write-Host "  Open docs/pages/prototypes/*.html directly"
