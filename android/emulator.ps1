# Runs the real Scripty Remote APK on an Android emulator (Pixel-sized phone, Android 14). Run: npm run emulator
#   -Url <link>   open the app with this link, e.g. a pairing link http://10.0.2.2:47830/?pair=...
#   -Headless     no emulator window (used by npm run test:android)
#   -Fresh        boot a private copy instead of reusing a running one (used by npm run test:android)
# Inside the emulator, this PC is 10.0.2.2, so type 10.0.2.2:47830 on the app's connect screen.
# Uses the same user-local toolchain as build-apk.ps1. Last line: the adb serial, plus " started" if this run booted it.
param([string]$Url = '', [switch]$Headless, [switch]$Fresh)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$T = Join-Path $env:LOCALAPPDATA 'ScriptyToolchain'
$jdk = Get-ChildItem (Join-Path $T 'jdk-x') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
$sdk = Join-Path $T 'sdk'
$sm = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
$avdm = Join-Path $sdk 'cmdline-tools\latest\bin\avdmanager.bat'
$emu = Join-Path $sdk 'emulator\emulator.exe'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$image = 'system-images;android-34;google_apis;x86_64'
$avd = 'scripty_phone'
if (-not $jdk -or -not (Test-Path $sm)) { throw "Toolchain missing in $T. Run npm run android once first." }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

$apk = Join-Path $here 'dist\Scripty-Remote.apk'
if (-not (Test-Path $apk)) { throw 'android\dist\Scripty-Remote.apk not found. Build it first: npm run android' }

if (-not (Test-Path $emu) -or -not (Test-Path (Join-Path $sdk 'system-images\android-34\google_apis\x86_64\system.img'))) {
  Write-Host 'Installing the Android emulator and an Android 14 phone image (about 1.5 GB, one time)...' -ForegroundColor Cyan
  & $sm "--sdk_root=$sdk" 'emulator' 'platform-tools' $image | Out-Host
  if (-not (Test-Path $emu)) { throw 'The emulator was not installed (licenses not accepted?). Run: npm run android, accept the licenses, then retry.' }
}

if (-not ((& $emu -list-avds) -contains $avd)) {
  Write-Host "Creating the emulator phone '$avd'..." -ForegroundColor Cyan
  'no' | & $avdm create avd -n $avd -k $image -d pixel_7 --force | Out-Null
}

# Only ever use OUR emulator phone; another running emulator (Android Studio, other projects) is left alone.
function Get-EmulatorSerial {
  (& $adb devices) -match '^emulator-\d+\s+device' | ForEach-Object { ($_ -split '\s+')[0] } |
    Where-Object { ((& $adb -s $_ emu avd name 2>$null) | Select-Object -First 1) -match "^$avd\s*$" } | Select-Object -First 1
}
# adb and the emulator write normal progress to stderr; under 'Stop' PowerShell 5.1 would treat that as fatal.
$ErrorActionPreference = 'Continue'

# -Fresh (tests): always boot a private read-only copy of the phone on a port we pick, so nothing else
# (another session, Android Studio) can share or steal it, and it is shut down if setup fails.
function Get-FreePort {
  foreach ($p in 5600..5680 | Where-Object { $_ % 2 -eq 0 }) {
    try { $a = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $p); $b = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $p + 1)
          $a.Start(); $b.Start(); $a.Stop(); $b.Stop(); return $p } catch { }
  }
  throw 'No free emulator port between 5600 and 5681.'
}
$started = $false
trap { if ($started -and $Headless -and $serial) { & $adb -s $serial emu kill 2>$null | Out-Null }; break }

$serial = if ($Fresh) { $null } else { Get-EmulatorSerial }
if (-not $serial) {
  $accel = & $emu -accel-check 2>&1 | Out-String
  if ($accel -notmatch 'is installed and usable') {
    Write-Warning "Hardware acceleration is not available, so the emulator will be very slow or refuse to start.`n$accel`nFix (admin PowerShell, then reboot): Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform"
  }
  $emuArgs = @('-avd', $avd, '-no-snapshot-save', '-no-boot-anim', '-netdelay', 'none', '-netspeed', 'full')
  if ($Headless) { $emuArgs += @('-no-window', '-no-audio', '-gpu', 'swiftshader_indirect') }
  if ($Fresh) { $port = Get-FreePort; $emuArgs += @('-read-only', '-port', $port); $serial = "emulator-$port" }
  Write-Host 'Starting the emulator...' -ForegroundColor Cyan
  Start-Process -FilePath $emu -ArgumentList $emuArgs -WindowStyle Hidden | Out-Null
  $started = $true
  $deadline = (Get-Date).AddMinutes(5)
  do {
    Start-Sleep -Seconds 3
    if (-not $Fresh) { $serial = Get-EmulatorSerial }
    $booted = $serial -and ((& $adb -s $serial shell getprop sys.boot_completed 2>$null) -match '1')
    if ((Get-Date) -gt $deadline) { throw 'The emulator did not finish booting within 5 minutes.' }
  } until ($booted)
  & $adb -s $serial shell input keyevent 82 | Out-Null # wake and unlock the screen
}

Write-Host "Installing Scripty Remote on $serial..." -ForegroundColor Cyan
# Tests start from a clean install: installing over an old copy is an app update, and UpdatedReceiver's
# "reopen after update" would replace the pairing link being tested.
if ($Fresh) { & $adb -s $serial uninstall app.scripty.remote 2>$null | Out-Null }
$out = ''
for ($i = 0; $i -lt 10 -and $out -notmatch 'Success'; $i++) { # the package manager can lag behind boot_completed
  $out = & $adb -s $serial install -r $apk 2>&1 | Out-String
  if ($out -match 'Success|INSTALL_FAILED_UPDATE_INCOMPATIBLE') { break }
  Start-Sleep -Seconds 3
}
if ($out -notmatch 'Success') {
  # Signed with a different key than the copy already installed: start clean.
  & $adb -s $serial uninstall app.scripty.remote | Out-Null
  $out = & $adb -s $serial install $apk 2>&1 | Out-String
  if ($out -notmatch 'Success') { throw "APK install failed: $out" }
}

if ($Url) { & $adb -s $serial shell am start -W -a android.intent.action.VIEW -d "'$Url'" -n app.scripty.remote/.MainActivity | Out-Null }
else { & $adb -s $serial shell am start -W -n app.scripty.remote/.MainActivity | Out-Null }

if (-not $Headless) {
  Write-Host "`nScripty Remote is running in the emulator." -ForegroundColor Green
  Write-Host 'To link it: start Scripty (npm start), open Remote, switch on Remote Link, then in the emulator type 10.0.2.2:47830 and the 6-digit code.'
}
Write-Output $(if ($started) { "$serial started" } else { $serial })
