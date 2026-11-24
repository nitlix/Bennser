# Bennser installer (Windows):  powershell -c "irm bennser.nitlix.com/install.ps1|iex"
#
# 1. Installs Bun (https://bun.sh) if it isn't on PATH, using Bun's official installer.
# 2. Installs the `bennser` npm package into %USERPROFILE%\.bennser (override with BENNSER_INSTALL).
# 3. Puts a `bennser.cmd` launcher in %USERPROFILE%\.bennser\bin that runs it with Bun,
#    and adds that folder to your user PATH.
#
# Re-run to update. Pin a version by setting $env:BENNSER_VERSION = "0.1.0" first.
# Uninstall: delete %USERPROFILE%\.bennser and remove its bin folder from your user PATH.

& {
	$ErrorActionPreference = "Stop"

	$Version = if ($env:BENNSER_VERSION) { $env:BENNSER_VERSION } else { "latest" }
	$InstallDir = if ($env:BENNSER_INSTALL) { $env:BENNSER_INSTALL } else { Join-Path $env:USERPROFILE ".bennser" }
	$BinDir = Join-Path $InstallDir "bin"

	function Fail($Message) {
		Write-Host "error: $Message" -ForegroundColor Red
		throw $Message
	}

	# 1. Bun
	$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
	if ($Bun) {
		Write-Host "using bun $(& $Bun --version) at $Bun" -ForegroundColor DarkGray
	} else {
		Write-Host "Bun isn't installed; installing it first (https://bun.sh)"
		Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
		$BunHome = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $env:USERPROFILE ".bun" }
		$Bun = Join-Path $BunHome "bin\bun.exe"
		if (-not (Test-Path $Bun)) { Fail "Bun installation failed" }
		$env:Path = "$(Split-Path $Bun);$env:Path"
	}

	# 2. The package
	New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
	$Manifest = Join-Path $InstallDir "package.json"
	if (-not (Test-Path $Manifest)) { Set-Content -Path $Manifest -Value '{ "private": true }' -Encoding ASCII }
	Write-Host "installing bennser@$Version" -ForegroundColor DarkGray
	& $Bun add --cwd $InstallDir "bennser@$Version" | Out-Null
	if ($LASTEXITCODE -ne 0) { Fail "bun couldn't install bennser@$Version" }

	# 3. Launcher. Runs the bundle with Bun, so Node isn't needed.
	$Entry = Join-Path $InstallDir "node_modules\bennser\dist\bennser.js"
	if (-not (Test-Path $Entry)) { Fail "the package is missing $Entry" }
	$Launcher = Join-Path $BinDir "bennser.cmd"
	# Absolute bun path, so the exit code passes straight through. Re-run this installer if Bun moves.
	Set-Content -Path $Launcher -Encoding ASCII -Value "@`"$Bun`" `"$Entry`" %*"

	$Installed = & $Launcher --version
	if ($LASTEXITCODE -ne 0) { Fail "bennser was installed but doesn't run" }
	Write-Host "bennser $Installed installed to $Launcher" -ForegroundColor Green

	# PATH (user scope, persists; plus this session)
	$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
	$Parts = if ($UserPath) { $UserPath -split ";" } else { @() }
	if ($Parts -notcontains $BinDir) {
		[Environment]::SetEnvironmentVariable("Path", (@($BinDir) + $Parts | Where-Object { $_ }) -join ";", "User")
		Write-Host "added $BinDir to your user PATH" -ForegroundColor DarkGray
	}
	if (($env:Path -split ";") -notcontains $BinDir) { $env:Path = "$BinDir;$env:Path" }

	Write-Host ""
	Write-Host "Open a new terminal, then run: bennser --help"
}
