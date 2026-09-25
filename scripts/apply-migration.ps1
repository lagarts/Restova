param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$ProjectRef = 'yzqqaosxpehhcqssixfk'
)

$ErrorActionPreference = 'Stop'

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) { throw 'Set SUPABASE_ACCESS_TOKEN (Supabase personal access token).' }

function ConvertTo-JsonString([string]$value) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $value.ToCharArray()) {
    switch ($ch) {
      '"'  { [void]$sb.Append('\"') }
      '\'  { [void]$sb.Append('\\') }
      "`n" { [void]$sb.Append('\n') }
      "`r" { [void]$sb.Append('\r') }
      "`t" { [void]$sb.Append('\t') }
      default {
        $code = [int][char]$ch
        if ($code -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $code)) } else { [void]$sb.Append($ch) }
      }
    }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

$sql = Get-Content -Raw -LiteralPath $File
$json = '{"query":' + (ConvertTo-JsonString $sql) + '}'
$bytes = [Text.Encoding]::UTF8.GetBytes($json)

$headers = @{ Authorization = "Bearer $token" }
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

try {
  $response = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $bytes -TimeoutSec 180
  Write-Host "OK $($File)" -ForegroundColor Green
  $response | ConvertTo-Json -Depth 6 -Compress
} catch {
  $detail = $_.ErrorDetails.Message
  if (-not $detail) { $detail = $_.Exception.Message }
  Write-Host "FAIL $($File)" -ForegroundColor Red
  Write-Host $detail
  exit 1
}
