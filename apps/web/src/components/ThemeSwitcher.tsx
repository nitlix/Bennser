"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LuMonitor, LuMoon, LuSun } from "react-icons/lu";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";

const OPTIONS = [
	{ theme: "light", Icon: LuSun, label: "Light" },
	{ theme: "dark", Icon: LuMoon, label: "Dark" },
	{ theme: "system", Icon: LuMonitor, label: "System" },
];

/** One plate button that cycles light → dark → system. */
export default function () {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const index = Math.max(
		0,
		OPTIONS.findIndex((o) => o.theme === theme),
	);
	const current = mounted ? OPTIONS[index]! : OPTIONS[2]!;
	const next = OPTIONS[(index + 1) % OPTIONS.length]!;

	return (
		<ButtonSecondary
			icon
			onClick={() => setTheme(next.theme)}
			aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
			title={`Theme: ${current.label}`}
		>
			<current.Icon size={16} />
		</ButtonSecondary>
	);
}
