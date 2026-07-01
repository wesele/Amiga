# Run all tests in parallel
# Usage: pwsh scripts/run-all-tests.ps1

$exitCode = 0

$root = (Get-Location).Path
$jobs = @(
  Start-Job -Name "frontend" -ScriptBlock {
    param($d)
    Set-Location $d
    npm test
    exit $LASTEXITCODE
  } -ArgumentList $root,
  Start-Job -Name "backend" -ScriptBlock {
    param($d)
    Set-Location $d
    cargo test
    exit $LASTEXITCODE
  } -ArgumentList (Join-Path $root "src-tauri")
)

$jobs | Wait-Job | Out-Null

foreach ($job in $jobs) {
  Write-Host "===== $($job.Name) ====="
  Receive-Job $job
  if ($job.State -ne "Completed") {
    $exitCode = 1
  }
}

$jobs | Remove-Job
exit $exitCode
