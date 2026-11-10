//===================================
// Add your custom types here.
//===================================

import Lenis from "lenis";

export type AsyncReturnType<T extends (...args: any) => any> = T extends (
	...args: any
) => Promise<infer R>
	? R
	: any;
export type SearchParams = Promise<{
	[key: string]: string | string[] | undefined;
}>;
export type LenisScrolltoProperties = NonNullable<
	Parameters<Lenis["scrollTo"]>[1]
>;

export type ThemeStyle = "dark" | "light";
export type ThemeTheme = ThemeStyle | "system";
