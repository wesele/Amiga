# Run all tests in parallel
# Usage: pwsh scripts/run-all-tests.ps1

$frontend = npm test
$backend  = & { cd src-tauri; cargo test }
$exitCode = 0

$job1 = Start-Job -ScriptBlock { param($d) cd $d; npm test } -ArgumentList (Get-Location).Path
$job2 = Start-Job -ScriptBlock { param($d) cd $d; cargo test } -ArgumentList (Join-Path (Get-Location).Path "src-tauri")

$j1 = $job1 | Wait-Job | Receive-Job
$j2 = $job2 | Wait-Job | Receive-Job

if ($job1.State -eq 'Failed') { $exitCode = 1 }
if ($job2.State -eq 'Failed') { $exitCode = 1 }

$job1, $job2 | Remove-Job
exit $exitCode
