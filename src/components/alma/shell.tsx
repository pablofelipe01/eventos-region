import Image from "next/image";
import { almaFont } from "./theme";

/** Colinas, cafetales y matas al pie de las pantallas interiores. */
function Foliage() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[22vh] min-h-32 max-h-72 sm:h-[26vh] lg:h-[30vh]"
    >
      {/* Fundido con el fondo crema para que no se note el borde superior. */}
      <div className="absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-[#f7f3e8] to-transparent" />
      <Image src="/alma/pie.webp" alt="" fill sizes="100vw" className="object-cover object-top" />
    </div>
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
        <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center py-6">{children}</div>
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
