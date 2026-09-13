import catalog from "@/data/pairs.json";
export type PairCategory = "xStocks" | "Backpack" | "Crypto";
export type Pair = { symbol: string; name: string; mint: string; category: PairCategory; logo: string };
export const pairs = catalog as Pair[];

