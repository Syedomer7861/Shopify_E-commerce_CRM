<#
  eSSL -> CRM attendance sync agent.

  Reads new punches from the eSSL eTimeTrackLite database on this PC (the one
  eSSL Online Downloader / eSSL_Schedular fills from your devices) and sends
  them to the CRM. Safe to run again and again: only punches newer than the
  last one sent are read, and the CRM ignores duplicates anyway.

  SETUP (once)
  1. In the CRM: Settings > API & Webhooks > create a key with the
     "attendance:write" scope. Copy it (it is shown once).
  2. Store the key for the Windows account that will run this script:
       [Environment]::SetEnvironmentVariable("CRM_ATTENDANCE_KEY", "cc_...", "User")
  3. Find your database:
       - Access edition: a .mdb file, often C:\eSSL\eTimeTrackLite\eTimeTrackLite1.mdb
         Needs "Microsoft Access Database Engine" (ACE). eSSL is 32-bit, so run
         this script with 32-bit PowerShell:
         C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe
       - SQL Server edition: pass -SqlConnection "Server=.\SQLEXPRESS;Database=eTimeTrackLite;Integrated Security=true"
  4. Test by hand:
       powershell -ExecutionPolicy Bypass -File essl-sync.ps1 -CrmUrl https://your-crm-address -DbPath "C:\eSSL\eTimeTrackLite\eTimeTrackLite1.mdb"
  5. Windows Task Scheduler: run the same command every 5 minutes.

  In the CRM, set each employee's device code (HR > Attendance > Biometric)
  to the same user ID they are enrolled with on the device.
#>
param(
  [Parameter(Mandatory = $true)][string]$CrmUrl,
  [string]$DbPath = "C:\eSSL\eTimeTrackLite\eTimeTrackLite1.mdb",
  [string]$SqlConnection = "",
  [int]$TzOffsetMinutes = 330,
  [string]$DeviceSerial = ""
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$key = $env:CRM_ATTENDANCE_KEY
if (-not $key) { throw "CRM_ATTENDANCE_KEY is not set for this Windows user (see SETUP step 2)." }

$stateDir = Join-Path $env:LOCALAPPDATA "CrmEsslSync"
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$stateFile = Join-Path $stateDir "last-sent.txt"
$since = if (Test-Path $stateFile) { [datetime]::Parse((Get-Content $stateFile -Raw).Trim()) } else { (Get-Date).AddDays(-7) }

if ($SqlConnection) {
  $conn = New-Object System.Data.SqlClient.SqlConnection $SqlConnection
} else {
  if (-not (Test-Path $DbPath)) { throw "Database not found at $DbPath (use -DbPath)." }
  $conn = New-Object System.Data.OleDb.OleDbConnection "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$DbPath;Mode=Read"
}
$conn.Open()

# eTimeTrackLite keeps one punch table per month: DeviceLogs_<month>_<year>.
$rows = New-Object System.Collections.Generic.List[object]
$months = @($since, (Get-Date)) | ForEach-Object { "DeviceLogs_{0}_{1}" -f $_.Month, $_.Year } | Select-Object -Unique
foreach ($table in $months) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = "SELECT UserId, LogDate, Direction FROM [$table] WHERE LogDate > ? ORDER BY LogDate"
  if ($SqlConnection) { $cmd.CommandText = $cmd.CommandText.Replace("?", "@since"); [void]$cmd.Parameters.AddWithValue("@since", $since) }
  else {
    # Access rejects a plain DateTime parameter ("data type mismatch"); send it as an OLE date.
    $p = $cmd.Parameters.Add("p1", [System.Data.OleDb.OleDbType]::Date); $p.Value = $since
  }
  try { $reader = $cmd.ExecuteReader() } catch { Write-Host "Skipping $table ($($_.Exception.GetBaseException().Message))"; continue }
  while ($reader.Read()) {
    $dir = "$($reader["Direction"])".Trim().ToLower()
    $rows.Add([ordered]@{
      employee_code = "$($reader["UserId"])".Trim()
      time          = ([datetime]$reader["LogDate"]).ToString("yyyy-MM-dd HH:mm:ss")
      direction     = $(if ($dir -eq "in" -or $dir -eq "out") { $dir } else { $null })
      _at           = [datetime]$reader["LogDate"]
    })
  }
  $reader.Close()
}
$conn.Close()

if ($rows.Count -eq 0) { Write-Host "No new punches since $since"; exit 0 }

$url = $CrmUrl.TrimEnd("/") + "/api/v1/attendance/punches"
for ($i = 0; $i -lt $rows.Count; $i += 1000) {
  $batch = $rows.GetRange($i, [Math]::Min(1000, $rows.Count - $i))
  $body = @{
    tz_offset_minutes = $TzOffsetMinutes
    device_serial     = $DeviceSerial
    punches           = @($batch | ForEach-Object { @{ employee_code = $_.employee_code; time = $_.time; direction = $_.direction } })
  } | ConvertTo-Json -Depth 4
  $res = Invoke-RestMethod -Method Post -Uri $url -Headers @{ Authorization = "Bearer $key" } -ContentType "application/json" -Body $body
  # Only move the bookmark forward after the CRM accepted the batch.
  $last = ($batch | Select-Object -Last 1)._at
  Set-Content -Path $stateFile -Value $last.ToString("o")
  Write-Host ("Sent {0} punches ({1} rejected), up to {2}" -f $res.received, $res.rejected, $last)
}
