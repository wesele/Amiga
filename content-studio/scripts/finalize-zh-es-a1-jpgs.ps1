param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)

Add-Type -AssemblyName System.Drawing
$images = Join-Path $Root 'data\images'
$quality = [System.Drawing.Imaging.Encoder]::Quality
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($quality, 92L)

foreach ($png in Get-ChildItem $images -Filter 'espanol-a1-*.png') {
  $jpg = [System.IO.Path]::ChangeExtension($png.FullName, '.jpg')
  $source = [System.Drawing.Image]::FromFile($png.FullName)
  try { $source.Save($jpg, $encoder, $encoderParams) } finally { $source.Dispose() }
  Remove-Item -LiteralPath $png.FullName -Force
}

$jsonPath = Join-Path $Root 'data\questions.json'
$questions = Get-Content -Raw -Encoding utf8 $jsonPath | ConvertFrom-Json
foreach ($q in $questions) {
  if ($q.pairId -ne 'zh-es' -or $q.cefr -ne 'A1') { continue }
  if ($q.type -eq 'T01') {
    if ($q.imageSvg) { $q.imageUrl = "/api/images/$($q.id).jpg" }
    continue
  }
  if ($q.type -eq 'T02') {
    for ($i = 0; $i -lt @($q.imageOptions).Count; $i++) {
      if ($q.imageOptions[$i].imageSvg) { $q.imageOptions[$i].imageUrl = "/api/images/$($q.id)-opt$i.jpg" }
    }
  }
}
$json = $questions | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($jsonPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
