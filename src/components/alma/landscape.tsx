/**
 * Paisaje rural en acuarela plana (colinas, árboles, casa, camino y matas).
 * SVG propio: no depende de imágenes externas y escala a cualquier ancho.
 */
export function Landscape({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMax slice"
      className={className}
      role="img"
      aria-label="Paisaje de montañas verdes con una casa campesina"
    >
      <defs>
        <linearGradient id="alma-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9cfa4" />
          <stop offset="1" stopColor="#a3bf8c" />
        </linearGradient>
        <linearGradient id="alma-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fb36f" />
          <stop offset="1" stopColor="#77a05a" />
        </linearGradient>
        <linearGradient id="alma-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9cbb63" />
          <stop offset="1" stopColor="#7fa24c" />
        </linearGradient>
        <linearGradient id="alma-path" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6d7ae" />
          <stop offset="1" stopColor="#d9c38e" />
        </linearGradient>
      </defs>

      {/* Montañas lejanas */}
      <path d="M0 120 C60 80 110 95 160 110 C210 70 270 60 320 95 C350 80 380 85 400 95 V300 H0Z" fill="url(#alma-far)" opacity="0.75" />
      {/* Colinas medias */}
      <path d="M0 160 C70 125 130 140 190 150 C250 120 330 115 400 140 V300 H0Z" fill="url(#alma-mid)" />
      {/* Árboles lejanos */}
      {[
        [40, 150, 9],
        [62, 146, 7],
        [300, 132, 8],
        [318, 128, 10],
        [345, 133, 7],
      ].map(([x, y, r], i) => (
        <g key={i}>
          <rect x={x - 1} y={y} width="2" height={r} fill="#5e4a33" />
          <circle cx={x} cy={y - r * 0.4} r={r} fill="#5f8f45" />
        </g>
      ))}

      {/* Casa campesina */}
      <g transform="translate(58 168)">
        <rect x="0" y="12" width="46" height="26" fill="#f4ead6" />
        <rect x="18" y="22" width="9" height="16" fill="#8a5a3b" />
        <rect x="5" y="19" width="8" height="7" fill="#9bb7c9" />
        <rect x="33" y="19" width="8" height="7" fill="#9bb7c9" />
        <path d="M-5 14 L23 -4 L51 14Z" fill="#b5523b" />
      </g>

      {/* Árbol grande junto a la casa */}
      <g transform="translate(130 150)">
        <rect x="-3" y="20" width="6" height="40" fill="#6b4f35" />
        <circle cx="0" cy="12" r="22" fill="#4f7f3a" />
        <circle cx="-14" cy="22" r="14" fill="#5d8f43" />
        <circle cx="14" cy="22" r="15" fill="#5a8a40" />
        <circle cx="4" cy="-2" r="14" fill="#6a9b4c" />
      </g>
      <g transform="translate(340 165)">
        <rect x="-2" y="14" width="4" height="30" fill="#6b4f35" />
        <circle cx="0" cy="8" r="16" fill="#558640" />
        <circle cx="-10" cy="16" r="10" fill="#629548" />
        <circle cx="10" cy="15" r="11" fill="#5c8e44" />
      </g>

      {/* Primer plano */}
      <path d="M0 215 C80 195 160 205 230 212 C300 200 360 198 400 205 V300 H0Z" fill="url(#alma-near)" />
      {/* Camino */}
      <path d="M150 300 C170 260 200 235 235 212 C240 210 246 211 244 214 C220 238 205 265 215 300Z" fill="url(#alma-path)" />

      {/* Matas en primer plano */}
      {[
        [20, 300, 1],
        [380, 300, -1],
      ].map(([x, y, dir], i) => (
        <g key={`leaf-${i}`} transform={`translate(${x} ${y}) scale(${dir} 1)`}>
          <path d="M0 0 C-4 -30 6 -55 22 -70 C18 -45 14 -20 0 0Z" fill="#4e7d36" />
          <path d="M6 0 C14 -22 30 -36 48 -42 C38 -24 24 -8 6 0Z" fill="#679a46" />
          <path d="M-4 0 C-18 -18 -22 -34 -18 -50 C-8 -36 -2 -20 -4 0Z" fill="#5c8f3f" />
        </g>
      ))}
    </svg>
  );
}
