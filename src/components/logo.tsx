/** Abstract mark: a coin whose upper arc becomes a rising path. Original artwork. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <circle cx="16" cy="17" r="8.5" fill="none" stroke="var(--primary-fg)" strokeWidth="2.4" opacity="0.9" />
      <path d="M10.5 18.5 L14.5 14.5 L17.5 17 L22.5 11.5" fill="none" stroke="var(--primary-fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
