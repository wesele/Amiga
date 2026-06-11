<# 
  Idioma 设计文档构建脚本
  将 phone/screens/*/content.html 和 sections/*.html 嵌入 index.html
  生成自包含文件，可在 file:// 协议下直接打开
#>

Add-Type -AssemblyName System.Text.Encoding

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$template = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes("$root\index.html"))

Write-Host "Idioma Design Doc Builder"
Write-Host "========================="

# 1. 嵌入 sections/*.html
$sectionCount = 0
[regex]::Matches($template, 'data-section="([^"]+)"') | ForEach-Object {
    $name = $_.Groups[1].Value
    $file = "$root\sections\$name.html"
    if (Test-Path -LiteralPath $file) {
        $content = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($file))
        $template = $template.Replace('data-section="' + $name + '"', $content)
        $sectionCount++
        Write-Host "  [OK] sections/$name.html ($([System.Text.Encoding]::UTF8.GetByteCount($content)) bytes)"
    } else {
        Write-Host "  [MISS] sections/$name.html not found"
    }
}

# 2. 嵌入 phone/screens/*/content.html
$screenCount = 0
[regex]::Matches($template, 'data-template="([^"]+)"') | ForEach-Object {
    $name = $_.Groups[1].Value
    $file = "$root\phone\screens\$name\content.html"
    if (Test-Path -LiteralPath $file) {
        $content = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($file))
        $template = $template.Replace('data-template="' + $name + '"', $content)
        $screenCount++
        Write-Host "  [OK] screens/$name/content.html ($([System.Text.Encoding]::UTF8.GetByteCount($content)) bytes)"
    } else {
        Write-Host "  [MISS] screens/$name/content.html not found"
    }
}

# 3. 写入输出
[System.IO.File]::WriteAllBytes("$root\index.html", [System.Text.Encoding]::UTF8.GetBytes($template))

Write-Host "========================="
Write-Host "Done: $sectionCount sections, $screenCount screens embedded"
Write-Host "Output: index.html ($([System.Text.Encoding]::UTF8.GetByteCount($template)) bytes)"
