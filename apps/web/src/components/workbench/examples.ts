import echoUpper from "../../../../../tests/programs/echo_upper.s?raw";
import factorial from "../../../../../tests/programs/factorial.s?raw";
import fib from "../../../../../tests/programs/fib.s?raw";
import hello from "../../../../../tests/programs/hello.s?raw";
import sumArray from "../../../../../tests/programs/sum_array.s?raw";

export type Example = {
	id: string;
	title: string;
	source: string;
	input?: string;
};

/** Same files the differential tests run against upstream Bennett. */
export const EXAMPLES: Example[] = [
	{ id: "hello", title: "Hello world", source: hello },
	{ id: "sum", title: "Sum an array", source: sumArray },
	{ id: "fib", title: "Fibonacci", source: fib },
	{ id: "fact", title: "Recursive factorial", source: factorial },
	{
		id: "echo",
		title: "Echo uppercase (input)",
		source: echoUpper,
		input: "hello bennett\n",
	},
];
