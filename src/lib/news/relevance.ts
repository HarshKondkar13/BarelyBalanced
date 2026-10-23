/**
 * Personal relevance notes for a story, derived ONLY from the user's own records.
 * If the data doesn't support a connection, nothing is shown.
 */
export type RelevanceData = {
  hasEquityHoldings: boolean;
  hasDebtHoldings: boolean;
  hasGoldHoldings: boolean;
  hasSip: boolean;
  hasLoanPayments: boolean;
  datedGoals: number;
  hasEmergencyGoal: boolean;
};

export function relevanceNotes(conceptIds: string[], d: RelevanceData): string[] {
  const notes: string[] = [];
  const has = (id: string) => conceptIds.includes(id);
  if ((has("repo-rate") || has("credit-growth")) && d.hasLoanPayments) notes.push("You've recorded loan/EMI payments; floating-rate loans can change with policy rates.");
  if ((has("bond-yield") || has("repo-rate")) && d.hasDebtHoldings) notes.push("You hold debt investments in your records; their values can move when interest rates change.");
  if ((has("fpi") || has("pe-ratio") || has("bond-yield")) && d.hasEquityHoldings) notes.push("You hold equity in your records. Short-term moves like this are normal and not a reason to act on their own.");
  if (has("sip") && d.hasSip) notes.push("You have a SIP in your recurring commitments.");
  if (has("cpi-inflation") && d.datedGoals > 0) notes.push(`Inflation affects what your ${d.datedGoals} dated goal${d.datedGoals > 1 ? "s" : ""} will cost when you reach them.`);
  if (has("credit-growth") && d.hasEmergencyGoal) notes.push("Higher deposit rates could matter for where you keep your emergency fund.");
  return notes;
}
