//===================================
// Add your custom global variables here.
//===================================

export const GITHUB_URL = "https://github.com/nitlix/Bennser";

export const SITE_URL = "https://bennser.nitlix.com";
export const NPM_URL = "https://www.npmjs.com/package/bennser";

/** One-line installers served from apps/web/public (install, install.ps1). */
export const INSTALL_COMMANDS = [
	{
		id: "unix",
		label: "macOS & Linux",
		prompt: "$",
		command: `curl -fsSL ${SITE_URL}/install | bash`,
	},
	{
		id: "windows",
		label: "Windows",
		prompt: ">",
		command: `powershell -c "irm ${SITE_URL.replace("https://", "")}/install.ps1|iex"`,
	},
] as const;
