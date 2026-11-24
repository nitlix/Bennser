import { twMerge } from "tailwind-merge";
import Montserrat from "@/fonts/Montserrat/Montserrat";
import Sunburst from "./Sunburst";

/** Sunburst + uppercase wordmark. Scale it with text-[*rem]; the mark follows the font size. */
export default function ({
	className,
	...props
}: React.JSX.IntrinsicElements["span"]) {
	return (
		<span
			aria-label="Bennser"
			className={twMerge(
				"flex flex-row items-center gap-[.3em] text-[1.125rem] font-[700] uppercase tracking-[.02em] leading-none text-black dark:text-white select-none",
				Montserrat.className,
				className,
			)}
			{...props}
		>
			<Sunburst className="size-[.95em]" />
			<span aria-hidden>Bennser</span>
		</span>
	);
}
