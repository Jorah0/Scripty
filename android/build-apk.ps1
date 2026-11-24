# Builds android/dist/Scripty-Remote.apk (the Android companion app). Run: npm run android
# Uses the user-local toolchain in %LOCALAPPDATA%\ScriptyToolchain (JDK 17, Android SDK, Gradle 8.7).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$T = Join-Path $env:LOCALAPPDATA 'ScriptyToolchain'
$jdk = Get-ChildItem (Join-Path $T 'jdk-x') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
$sdk = Join-Path $T 'sdk'
$gradle = Join-Path $T 'gradle-8.7\bin\gradle.bat'
$sm = Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not $jdk -or -not (Test-Path $gradle) -or -not (Test-Path $sm)) { throw "Toolchain missing in $T. Ask Claude to set it up again." }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdk
$env:Path = (Join-Path $jdk.FullName 'bin') + ';' + $env:Path

$needed = @('platforms;android-34', 'build-tools;34.0.0')
$missing = -not (Test-Path (Join-Path $sdk 'platforms\android-34\android.jar')) -or -not (Test-Path (Join-Path $sdk 'build-tools\34.0.0'))
if ($missing) {
  Write-Host "`nThe Android SDK needs Google's license terms accepted before it can be used." -ForegroundColor Cyan
  Write-Host "Read each license below and type y to accept (or n to stop).`n" -ForegroundColor Cyan
  & $sm "--sdk_root=$sdk" --licenses
  & $sm "--sdk_root=$sdk" @needed
  if (-not (Test-Path (Join-Path $sdk 'platforms\android-34\android.jar'))) { throw 'Android SDK packages were not installed (licenses not accepted?).' }
}

Set-Content (Join-Path $here 'local.properties') ('sdk.dir=' + ($sdk -replace '\\', '\\\\')) -Encoding ascii
Push-Location $here
try { & $gradle --no-daemon -q assembleRelease; if ($LASTEXITCODE) { throw "Gradle build failed ($LASTEXITCODE)" } }
finally { Pop-Location }

$apk = Join-Path $here 'app\build\outputs\apk\release\app-release.apk'
$out = Join-Path $here 'dist'
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item $apk (Join-Path $out 'Scripty-Remote.apk') -Force
$size = [math]::Round((Get-Item (Join-Path $out 'Scripty-Remote.apk')).Length / 1MB, 2)
# version.json lets the desktop offer this build to linked phones; the phone checks the SHA-256 before installing.
$pkg = Get-Content (Join-Path $here '..\package.json') -Raw | ConvertFrom-Json
$v = $pkg.version.Split('.') | ForEach-Object { [int]$_ }
$info = [ordered]@{ versionCode = $v[0] * 10000 + $v[1] * 100 + $v[2]; versionName = $pkg.version; sha256 = (Get-FileHash (Join-Path $out 'Scripty-Remote.apk') -Algorithm SHA256).Hash.ToLower() }
($info | ConvertTo-Json -Compress) | Set-Content (Join-Path $out 'version.json') -Encoding ascii
Write-Host "`nBuilt android\dist\Scripty-Remote.apk ($size MB)" -ForegroundColor Green
Write-Host "Next: npm run dist   (bundles it into Scripty so your phone can download it from the Remote page)"
