import localFont from "next/font/local";

// =====================
// Montserrat (variable, latin)
// Used for the Bennser wordmark.
// =====================
const Montserrat = localFont({
	src: "./Montserrat-Variable.woff2",
	variable: "--font-montserrat",
	weight: "100 900",
	display: "swap",
});

export default Montserrat;
