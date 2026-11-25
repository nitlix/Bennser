"use client";

import {
	BENNETT_CSRS,
	CSR_BY_ADDRESS,
	CSRS,
	csrName,
	hex32,
	type StepTrace,
} from "@bennser/core";
import { LuListPlus } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import PanelBase from "@/components/PanelBase";
import { NamePill } from "./Registers";
import s from "./Registers.module.scss";
import { useStored } from "./useStored";

type Format = "hex" | "dec";

const FORMATS: { id: Format; label: string; full: string }[] = [
	{ id: "hex", label: "Hex", full: "Hexadecimal" },
	{ id: "dec", label: "Dec", full: "Unsigned decimal" },
];

const ALL_LISTED = CSRS.map((c) => c.address);
const BENNETT = [...BENNETT_CSRS.keys()];

const tooltip = (address: number, value: number) => {
	const info = CSR_BY_ADDRESS.get(address);
	const head = info
		? `${info.description} (${info.access})`
		: "Not in Bennett's CSR list.";
	return `${head}\n0x${hex32(address).slice(-3)} = ${value >>> 0} (0x${hex32(value)})`;
};

type Props = { csr: Uint32Array; trace: StepTrace | null };

/**
 * Read-only CSR bank. Bennett shows the 15 CSRs of its csrlist.h; "All" adds the rest of
 * csrlist. Any non-zero CSR shows either way. Not editable: Bennett's editor sends the write,
 * but its emulator drops MemWriteCSR32 ("unsupported").
 */
export default function ({ csr, trace }: Props) {
	const [format, setFormat] = useStored<Format>(
		"bennser:csrFormat",
		"hex",
		(v) => FORMATS.some((f) => f.id === v),
	);
	const [all, setAll] = useStored<boolean>(
		"bennser:csrAll",
		false,
		(v) => typeof v === "boolean",
	);
	const written = new Set(trace?.csrWrites.map((w) => w.csr));

	const shown = new Set([...(all ? ALL_LISTED : BENNETT), ...written]);
	csr.forEach((value, address) => value && shown.add(address));
	const rows = [...shown].sort((a, b) => a - b);

	const actions = (
		<div className="flex flex-row gap-[.3rem]">
			<ButtonSecondary
				size="small"
				aria-pressed={all}
				icon
				onClick={() => setAll(!all)}
				title={
					all
						? "Showing every CSR in Bennett's csrlist. Click for just its CSR bank."
						: "Show every CSR in Bennett's csrlist, not just its CSR bank"
				}
				aria-label="Show all CSRs"
			>
				<LuListPlus size={16} />
			</ButtonSecondary>
			<div className="w-[1px] h-[1.25rem] self-center mx-[.15rem] bg-neutral-200 dark:bg-neutral-800" />
			{FORMATS.map((f) => (
				<ButtonSecondary
					key={f.id}
					size="small"
					aria-pressed={f.id === format}
					onClick={() => setFormat(f.id)}
					title={f.full}
				>
					{f.label}
				</ButtonSecondary>
			))}
		</div>
	);

	return (
		<PanelBase title="CSRs" actions={actions}>
			<div
				className="flex-1 min-h-0 overflow-auto pb-[1px]"
				data-lenis-prevent
			>
				<div className={s.table}>
					{rows.map((address) => {
						const value = csr[address]!;
						return (
							<div
								key={address}
								className={twMerge(
									s.cell,
									written.has(address) && s.written,
								)}
								title={tooltip(address, value)}
							>
								<span className="flex flex-row items-center gap-[.35rem] min-w-0 text-neutral-500">
									<NamePill>{csrName(address)}</NamePill>
									<span className="text-[.7rem] translate-y-[.04rem]">
										0x{hex32(address).slice(-3)}
									</span>
								</span>
								<span
									className={
										value
											? "text-black dark:text-white"
											: "text-neutral-400 dark:text-neutral-600"
									}
								>
									{format === "hex"
										? hex32(value)
										: String(value >>> 0)}
								</span>
							</div>
						);
					})}
				</div>
			</div>
		</PanelBase>
	);
}
