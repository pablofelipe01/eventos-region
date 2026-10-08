"use client";

/**
 * Mesa de las herramientas: los cuatro objetos ilustrados sobre una mesa de
 * madera. Es una imagen de referencia; la herramienta real se elige en la mesa física.
 */
import Image from "next/image";
import { OBJECTS, type AlmaObject } from "@/lib/alma/config";

const IMAGES: Record<AlmaObject, string> = {
  Machete: "/alma/objetos/machete.webp",
  Sombrero: "/alma/objetos/sombrero.webp",
  Botas: "/alma/objetos/botas.webp",
  Rastrillo: "/alma/objetos/rastrillo.webp",
};

/** Tablero de madera en perspectiva, con tablas y canto frontal. */
function Tabletop() {
  return (
    <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="alma-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9a86c" />
          <stop offset="1" stopColor="#c48c54" />
        </linearGradient>
        <linearGradient id="alma-wood-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8f5b33" />
          <stop offset="1" stopColor="#6d4324" />
        </linearGradient>
      </defs>
      {/* sombra bajo la mesa */}
      <ellipse cx="200" cy="112" rx="190" ry="8" fill="#1f4d36" opacity="0.12" />
      {/* canto frontal */}
      <path d="M8 86 Q8 104 24 104 H376 Q392 104 392 86 V78 H8Z" fill="url(#alma-wood-edge)" />
      {/* tablero */}
      <path d="M30 12 Q30 6 36 6 H364 Q370 6 370 12 L392 78 Q392 86 384 86 H16 Q8 86 8 78Z" fill="url(#alma-wood)" />
      {/* juntas entre tablas */}
      {[[118, 36, 103, 20], [200, 36, 200, 20], [282, 36, 297, 20]].map(([x1, x2], i) => (
        <path key={i} d={`M${x2} 6 L${x1} 86`} stroke="#a9733f" strokeWidth="1.2" opacity="0.7" />
      ))}
      {/* vetas */}
      {[22, 40, 58, 74].map((y, i) => (
        <path
          key={y}
          d={`M${40 - i * 4} ${y} Q 120 ${y - 4} 200 ${y} T ${360 + i * 4} ${y}`}
          stroke="#b57b45"
          strokeWidth="1"
          fill="none"
          opacity="0.45"
        />
      ))}
      {/* brillo superior */}
      <path d="M36 6 H364 Q370 6 370 12 L372 18 H28 L30 12 Q30 6 36 6Z" fill="#ffffff" opacity="0.18" />
    </svg>
  );
}

export function ObjectTable() {
  return (
    <figure className="w-full max-w-sm sm:max-w-md" aria-label="Herramientas sobre la mesa: machete, sombrero, botas y rastrillo">
      <div className="relative">
        {/* Objetos: apoyados sobre el tablero (solapan su borde superior). */}
        <div className="relative z-10 grid grid-cols-4 items-end gap-1 px-3 sm:gap-3 sm:px-4">
          {OBJECTS.map((name) => (
            <div key={name} className="flex min-w-0 flex-col items-center">
              <Image
                src={IMAGES[name]}
                alt={name}
                width={512}
                height={512}
                priority
                className="h-auto w-full drop-shadow-[0_6px_6px_rgba(60,35,10,0.35)]"
              />
              {/* sombra de contacto sobre la mesa */}
              <span className="mt-[-6%] block h-2 w-[70%] rounded-full bg-[#4a2c12]/30 blur-[3px]" aria-hidden />
            </div>
          ))}
        </div>
        {/* Tablero */}
        <div className="relative -mt-7 h-24 sm:-mt-9 sm:h-28">
          <Tabletop />
        </div>
      </div>
    </figure>
  );
}
