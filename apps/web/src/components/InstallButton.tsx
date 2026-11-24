"use client";

import { useEffect, useState } from "react";
import { LuCheck, LuCopy, LuDownload } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import Menu from "@/components/workbench/Menu";
import { INSTALL_COMMANDS, NPM_URL } from "@/var/vars";

type Os = (typeof INSTALL_COMMANDS)[number]["id"];

/** Icon plate with the one-line CLI installers, picked per OS like bun.sh. */
export default function () {
	const [os, setOs] = useState<Os>("unix");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (
			/win/i.test(navigator.userAgent) &&
			!/darwin/i.test(navigator.userAgent)
		) {
			setOs("windows");
		}
	}, []);

	const current = INSTALL_COMMANDS.find((c) => c.id === os)!;

	async function copy() {
		try {
			await navigator.clipboard.writeText(current.command);
		} catch {
			return;
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<Menu
			icon
			label={<LuDownload size={16} />}
			title="Install the CLI"
			align="right"
			panelRole="dialog"
			panelClassName="w-[min(33rem,calc(100vw-2rem))] grid-cols-[minmax(0,1fr)] gap-[.6rem] p-[.75rem]"
		>
			{() => (
				<>
					<div className="flex flex-col gap-[.2rem]">
						<p className="text-[.875rem] font-[600] text-black dark:text-white">
							Install the Bennser CLI
						</p>
						<p className="text-[.8rem] leading-relaxed text-neutral-500">
							Run Bennett RISC-V programs from your terminal.
							Installs Bun first if you don't have it.
						</p>
					</div>

					<div
						role="tablist"
						className="flex flex-row p-[.2rem] gap-[.2rem] rounded-[.7rem] bg-neutral-100 dark:bg-neutral-900"
					>
						{INSTALL_COMMANDS.map((c) => (
							<button
								key={c.id}
								type="button"
								role="tab"
								aria-selected={c.id === os}
								onClick={() => setOs(c.id)}
								className={twMerge(
									"flex-1 h-[2rem] rounded-[.5rem] text-[.8rem] font-[500] text-neutral-500",
									c.id === os &&
										"bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm",
								)}
							>
								{c.label}
							</button>
						))}
					</div>

					<div className="flex flex-row items-center gap-[.5rem] pl-[.85rem] pr-[.35rem] py-[.35rem] min-w-0 rounded-[.7rem] bg-neutral-950 dark:bg-neutral-900 text-neutral-100 font-mono text-[.8rem]">
						<span className="text-amber-400 select-none">
							{current.prompt}
						</span>
						<code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap py-[.4rem]">
							{current.command}
						</code>
						<button
							type="button"
							onClick={copy}
							aria-label="Copy install command"
							title={copied ? "Copied" : "Copy"}
							className="grid place-items-center shrink-0 size-[2.25rem] rounded-[.5rem] hover:bg-neutral-800 dark:hover:bg-neutral-700"
						>
							{copied ? (
								<LuCheck size={16} className="text-amber-400" />
							) : (
								<LuCopy size={16} />
							)}
						</button>
					</div>

					<p className="text-[.8rem] leading-relaxed text-neutral-500">
						Then:{" "}
						<code className="font-mono">bennser run prog.s</code>.
						Already have Node? Use{" "}
						<code className="font-mono">npx bennser</code> (
						<a
							href={NPM_URL}
							target="_blank"
							rel="noreferrer"
							className="underline hover:text-black dark:hover:text-white"
						>
							npm
						</a>
						).
					</p>
				</>
			)}
		</Menu>
	);
}
