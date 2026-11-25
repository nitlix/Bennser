import { twMerge } from "tailwind-merge";

/** A label, not a control: looks like the button plate but does nothing. */
export default function ({
	className,
	children,
	...props
}: React.JSX.IntrinsicElements["div"]) {
	return (
		<div
			className={twMerge(
				"flex flex-row items-center gap-[.45rem] h-[2rem] px-[.75rem] rounded-[.6rem] border-[1px] border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[.875rem] font-[600] text-neutral-700 dark:text-neutral-300 whitespace-nowrap",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
