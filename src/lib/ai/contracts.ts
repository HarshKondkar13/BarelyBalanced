/**
 * Contracts for generated content. Model output is untrusted: it is parsed with these
 * schemas, length-limited, and rejected if it does not validate. Generated text may
 * explain figures but never supplies them; numbers shown in the UI come from the ledger.
 */
import { z } from "zod";

const line = z.string().trim().min(1).max(400);

export const NewsExplainerSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  /** Statements attributed to the source article. */
  reportedFacts: z.array(line).min(1).max(6),
  whyItMatters: z.string().trim().min(1).max(600),
  /** Analysis or opinion, clearly separated from facts. */
  interpretation: z.array(line).max(4),
  /** Possible effects, explicitly hypothetical. Never a trade instruction. */
  possibleEffects: z.object({
    consumers: line.optional(),
    companies: line.optional(),
    sectors: line.optional(),
    assetClasses: line.optional(),
  }),
  uncertainties: z.array(line).min(1).max(4),
  glossary: z.array(z.object({ term: z.string().max(60), definition: z.string().max(300) })).max(5),
  conceptIds: z.array(z.string().max(40)).max(3).default([]),
});
export type NewsExplainer = z.infer<typeof NewsExplainerSchema>;

/** AI may rephrase an insight's explanation, but must echo back the same evidence values. */
export const InsightExplanationSchema = z.object({
  plainLanguage: z.string().trim().min(1).max(700),
  evidenceEcho: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type InsightExplanation = z.infer<typeof InsightExplanationSchema>;

/** Strip control characters and cap length on any untrusted text before display or prompting. */
export function sanitizeUntrusted(text: string, max = 2000): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}
