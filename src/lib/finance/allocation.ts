/**
 * Educational asset-class mixes. These are rule-of-thumb ranges used for illustration,
 * keyed by horizon and the more conservative of risk tolerance and capacity.
 * They are not personalised investment advice and name no products.
 */
import type { Level } from "./profile";
import type { Mix } from "./scenarios";

export type HorizonBand = "short" | "medium" | "long";
export const horizonBand = (years: number): HorizonBand => (years < 3 ? "short" : years < 7 ? "medium" : "long");

const TABLE: Record<HorizonBand, Record<Level, Mix>> = {
  short: {
    low: { equity: 0, debt: 0.6, gold: 0, cash: 0.4 },
    medium: { equity: 0.1, debt: 0.6, gold: 0, cash: 0.3 },
    high: { equity: 0.15, debt: 0.6, gold: 0.05, cash: 0.2 },
  },
  medium: {
    low: { equity: 0.2, debt: 0.65, gold: 0.1, cash: 0.05 },
    medium: { equity: 0.4, debt: 0.45, gold: 0.1, cash: 0.05 },
    high: { equity: 0.6, debt: 0.3, gold: 0.1, cash: 0 },
  },
  long: {
    low: { equity: 0.35, debt: 0.5, gold: 0.1, cash: 0.05 },
    medium: { equity: 0.6, debt: 0.3, gold: 0.1, cash: 0 },
    high: { equity: 0.75, debt: 0.15, gold: 0.1, cash: 0 },
  },
};

export function illustrativeMix(years: number, risk: Level | null): { mix: Mix; band: HorizonBand; risk: Level; note: string } {
  const band = horizonBand(years);
  const r = risk ?? "low";
  const note =
    band === "short"
      ? "Money needed within ~3 years is usually kept mostly in stable, liquid assets, because there may be no time to recover from a fall."
      : band === "medium"
        ? "Medium horizons often balance growth assets with stable ones."
        : "Long horizons can tolerate more volatility in pursuit of growth, provided reserves are in place and you can stay invested through falls.";
  return { mix: TABLE[band][r], band, risk: r, note: risk ? note : `${note} Risk profile unknown, so the most conservative mix is shown.` };
}
