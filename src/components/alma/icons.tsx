/** Iconos de Alma (SVG en línea, heredan el color con currentColor). */

export function SproutIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 29V15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M16 17C16 10 11 6 4 6c0 7 5 11 12 11Z" fill="currentColor" />
      <path d="M16 15c0-6 4-10 11-10 0 6-4 10-11 10Z" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
