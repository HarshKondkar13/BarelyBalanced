/** Branding is configuration, not code: rename the app via environment variables. */
export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Barely Balanced",
  shortName: process.env.NEXT_PUBLIC_APP_SHORT_NAME || "Barely Balanced",
  tagline:
    process.env.NEXT_PUBLIC_APP_TAGLINE ||
    "Understand your money, make informed decisions, and follow through every day.",
};
