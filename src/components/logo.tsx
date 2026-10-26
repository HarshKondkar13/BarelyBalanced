/** Abstract mark: a coin whose upper arc becomes a rising path. Original artwork; colours follow the theme. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="shrink-0">
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="var(--logo-bg, var(--primary))" stroke="var(--logo-ring, transparent)" />
      <circle cx="16" cy="17" r="8.5" fill="none" stroke="var(--logo-fg, var(--primary-fg))" strokeWidth="2.4" opacity="0.9" />
      <path d="M10.5 18.5 L14.5 14.5 L17.5 17 L22.5 11.5" fill="none" stroke="var(--logo-accent, var(--primary-fg))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
