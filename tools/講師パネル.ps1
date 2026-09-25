# 講師パネル：演習の解答・解説を、受講者のページで開けるようにする
# 使い方：「講師パネル.bat」をダブルクリック
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$data = Get-Content (Join-Path $here 'panel_data.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$keys = Get-Content (Join-Path $here 'answer_keys.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$repo = "$($data.owner)/$($data.repo)"
$path = "repos/$repo/contents/release.json"

function Get-Release {
  $res = gh api $path | ConvertFrom-Json
  $json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($res.content -replace '\s','')))
  $obj = $json | ConvertFrom-Json
  $open = @{}
  if ($obj.open) { $obj.open.PSObject.Properties | ForEach-Object { $open[$_.Name] = $_.Value } }
  return @{ sha = $res.sha; open = $open }
}

function Save-Release($open, $sha, $message) {
  $json = (@{ open = $open } | ConvertTo-Json -Compress)
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($json))
  gh api -X PUT $path -f message="$message" -f content="$b64" -f sha="$sha" | Out-Null
}

while ($true) {
  Clear-Host
  Write-Host "=== 講師パネル（$repo）===" -ForegroundColor Cyan
  try { $rel = Get-Release } catch { Write-Host "GitHubに接続できません: $_" -ForegroundColor Red; Read-Host "Enterで再試行"; continue }
  $i = 0
  foreach ($ex in $data.exercises) {
    $i++
    $state = if ($rel.open.ContainsKey($ex.id)) { '[公開中]' } else { '[ 閉 ]  ' }
    $color = if ($rel.open.ContainsKey($ex.id)) { 'Green' } else { 'Gray' }
    Write-Host ("{0,2}. {1} {2}" -f $i, $state, $ex.title) -ForegroundColor $color
  }
  Write-Host ""
  Write-Host " 番号 = 開く／閉じる（切り替え）   A = すべて開く   R = すべて閉じる（研修後）   Enter = 最新の状態に更新   Q = 終了"
  Write-Host " ※受講者の画面には、1分ほどで反映されます（受講者が［確認］を押すとすぐ反映）"
  $cmd = (Read-Host "操作").Trim().ToUpper()
  if ($cmd -eq 'Q') { break }
  if ($cmd -eq '') { continue }
  $open = $rel.open
  if ($cmd -eq 'A') {
    foreach ($ex in $data.exercises) { $open[$ex.id] = $keys.($ex.id) }
    $msg = 'open all'
  } elseif ($cmd -eq 'R') {
    $open = @{}
    $msg = 'close all'
  } elseif ($cmd -match '^\d+$' -and [int]$cmd -ge 1 -and [int]$cmd -le $data.exercises.Count) {
    $ex = $data.exercises[[int]$cmd - 1]
    if ($open.ContainsKey($ex.id)) { $open.Remove($ex.id); $msg = "close $($ex.id)" }
    else { $open[$ex.id] = $keys.($ex.id); $msg = "open $($ex.id)" }
  } else { continue }
  try { Save-Release $open $rel.sha $msg; Write-Host "反映しました: $msg" -ForegroundColor Green }
  catch { Write-Host "保存に失敗しました: $_" -ForegroundColor Red }
  Start-Sleep -Milliseconds 800
}
