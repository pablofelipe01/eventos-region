import { almaFont } from "./theme";

/** Matas y colinas al pie de las pantallas interiores. */
function Foliage() {
  return (
    <svg
      viewBox="0 0 400 120"
      preserveAspectRatio="xMidYMax slice"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-28 w-full sm:h-40 lg:h-52"
      aria-hidden
    >
      <path d="M0 95 C80 70 160 80 230 88 C300 75 360 72 400 80 V120 H0Z" fill="#cfe0b8" />
      <path d="M0 108 C90 92 190 98 260 104 C320 96 370 94 400 100 V120 H0Z" fill="#bdd3a1" />
      {[
        [12, 120, 1],
        [388, 120, -1],
      ].map(([x, y, dir], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${dir} 1)`}>
          <path d="M0 0 C-4 -36 8 -62 26 -78 C20 -50 14 -22 0 0Z" fill="#3f6d2f" />
          <path d="M8 0 C18 -26 36 -42 56 -48 C44 -28 26 -10 8 0Z" fill="#5a8d41" />
          <path d="M-6 0 C-22 -20 -28 -40 -22 -58 C-10 -42 -2 -22 -6 0Z" fill="#4c7d37" />
          <path d="M20 0 C30 -14 44 -22 60 -24 C50 -12 36 -4 20 0Z" fill="#6c9d4e" />
        </g>
      ))}
    </svg>
  );
}

/** Puntos de progreso (3 pasos), como en el diseño. */
export function Progress({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div className="flex items-center" aria-label={`Paso ${step} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center">
          <span className={`size-2.5 rounded-full ${i < step ? "bg-[#1f4d36]" : "bg-[#cfd6cc]"}`} />
          {i < total - 1 && <span className="h-0.5 w-7 bg-[#cfd6cc]" />}
        </div>
      ))}
    </div>
  );
}

/** Marco de las pantallas interiores de Alma. */
export function AlmaShell({
  step,
  children,
  bottom,
}: {
  step?: number;
  children: React.ReactNode;
  /** Zona inferior (botones) por encima de las matas. */
  bottom?: React.ReactNode;
}) {
  return (
    <main
      className={`${almaFont.variable} relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-[#f7f3e8] text-[#1f4d36]`}
      style={{ fontFamily: "var(--font-alma), system-ui, sans-serif" }}
    >
      <div className="flex w-full min-w-0 max-w-md flex-1 flex-col items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-center sm:max-w-lg sm:px-8 lg:max-w-xl">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-[#3d5a4a]">AGENTICS</p>
        {step !== undefined && (
          <div className="mt-5">
            <Progress step={step} />
          </div>
        )}
        <div className="flex w-full min-w-0 flex-1 flex-col items-center">{children}</div>
        {bottom && (
          <div className="flex w-full min-w-0 justify-center pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 sm:pb-12">{bottom}</div>
        )}
      </div>
      <Foliage />
    </main>
  );
}

export const primaryButton =
  "inline-flex h-14 w-full max-w-sm items-center justify-center gap-3 rounded-full bg-[#1f4d36] text-lg font-bold text-white shadow-lg shadow-[#1f4d36]/30 transition hover:bg-[#173d2a] active:scale-[0.98] disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4f8a3c]";
