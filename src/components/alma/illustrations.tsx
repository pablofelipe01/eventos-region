/** Ilustraciones planas de Alma (SVG propio). */

export function Confetti() {
  const pieces = [
    [30, 20, "#e9b949", 25],
    [70, 10, "#8fb36f", -20],
    [120, 28, "#e5484d", 40],
    [170, 8, "#e9b949", -35],
    [230, 24, "#1f4d36", 15],
    [280, 12, "#e5484d", -10],
    [330, 30, "#8fb36f", 30],
    [360, 10, "#e9b949", -25],
    [20, 60, "#8fb36f", 60],
    [340, 62, "#e5484d", -50],
  ];
  return (
    <svg viewBox="0 0 400 80" className="absolute inset-x-0 top-0 h-20 w-full" aria-hidden>
      {pieces.map(([x, y, c, r], i) => (
        <rect key={i} x={x} y={y} width="12" height="5" rx="1.5" fill={c as string} transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </svg>
  );
}

/** Bebida y refrigerio (pantalla de gracias). */
export function Snack({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      {/* botella */}
      <path d="M60 10h14v18c8 4 12 10 12 20v60a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6V48c0-10 4-16 12-20Z" fill="#a9612e" />
      <rect x="60" y="6" width="14" height="8" rx="2" fill="#e9b949" />
      <rect x="50" y="58" width="34" height="30" rx="4" fill="#f4ead6" />
      <path d="M58 68h18M58 76h12" stroke="#1f4d36" strokeWidth="3" strokeLinecap="round" />
      {/* bol con refrigerio */}
      <path d="M86 86h66c0 14-10 26-33 26S86 100 86 86Z" fill="#c9823f" />
      <ellipse cx="119" cy="86" rx="33" ry="8" fill="#e8a24b" />
      {[100, 112, 124, 136, 106, 118, 130].map((x, i) => (
        <circle key={i} cx={x} cy={i < 4 ? 82 : 78} r="5" fill="#f2c94c" stroke="#d9a53a" strokeWidth="1" />
      ))}
    </svg>
  );
}

export function Machete({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M12 50 L44 14 C50 10 56 12 56 18 C56 24 50 30 44 34 L20 54Z" fill="#c9ced3" />
      <path d="M16 52 L46 20" stroke="#9aa3ab" strokeWidth="2" />
      <path d="M8 56 L16 48 L22 54 L14 62Z" fill="#6b4f35" />
    </svg>
  );
}

export function Hat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <ellipse cx="32" cy="42" rx="28" ry="9" fill="#d8b36a" />
      <path d="M16 42c0-14 4-24 16-24s16 10 16 24Z" fill="#e3c27e" />
      <path d="M16 38c6 3 26 3 32 0v6c-6 3-26 3-32 0Z" fill="#6b4f35" />
    </svg>
  );
}

export function Boots({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M14 8h14v28l12 6c6 3 6 10 0 10H14Z" fill="#8a5a3b" />
      <path d="M34 8h14v28l6 6c4 4 2 10-4 10H34Z" fill="#6f452b" />
      <rect x="12" y="50" width="30" height="6" rx="2" fill="#3f2a1a" />
      <rect x="32" y="50" width="20" height="6" rx="2" fill="#2f1f13" />
    </svg>
  );
}

export function Fruits({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {[
        [18, 36],
        [32, 28],
        [46, 36],
        [25, 46],
        [39, 46],
        [32, 40],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="8" fill="#c0392b" stroke="#8f2a1f" strokeWidth="1.5" />
      ))}
      <path d="M32 20c0-6 4-10 10-12-2 6-4 10-10 12Z" fill="#4f8a3c" />
    </svg>
  );
}
