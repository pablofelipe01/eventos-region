import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, SproutIcon } from "./icons";
import { almaFont } from "./theme";

/** Pantalla 1 de Alma: bienvenida tras escanear el QR. */
export function AlmaWelcome({ nextHref }: { nextHref: string }) {
  return (
    <main
      className={`${almaFont.variable} relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-[#f7f3e8] text-[#1f4d36]`}
      style={{ fontFamily: "var(--font-alma), system-ui, sans-serif" }}
    >
      {/* Paisaje ilustrado: el cielo (tercio superior) queda libre para el texto. */}
      <Image
        src="/alma/paisaje.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover object-[50%_100%] md:object-[50%_35%]"
      />
      {/* Suaviza el cielo para que el texto se lea bien. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[55%] bg-gradient-to-b from-[#eef4f1]/85 via-[#eef4f1]/55 to-transparent md:h-[62%] md:from-[#eef4f1]/95 md:via-[#eef4f1]/75"
      />

      <div className="flex w-full min-w-0 max-w-md flex-1 flex-col items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-center sm:max-w-lg">
        <p className="text-[11px] font-semibold tracking-[0.35em] text-[#3d5a4a]">
          AGENTICS
        </p>

        <div className="flex flex-1 flex-col items-center justify-center pt-[12vh] pb-4">
          <h1 className="text-[clamp(2.2rem,10vw,3.5rem)] leading-[1.1] font-extrabold tracking-tight">
            ¡Hola!
            <br />
            <span className="inline-flex items-end gap-1">
              Soy Alma
              <SproutIcon className="mb-1.5 size-[0.8em] text-[#4f8a3c]" />
            </span>
          </h1>

          <p className="mt-5 max-w-[19rem] text-[clamp(1rem,4.2vw,1.2rem)] leading-relaxed text-[#2f4a3c] sm:max-w-md">
            Hoy queremos conocerte. Tus historias nos ayudarán a construir un
            futuro mejor para Las Moras.
          </p>
        </div>
      </div>

      {/* Botón sobre el paisaje */}
      <div className="relative w-full">
        <div className="h-[clamp(13rem,42vh,34rem)] w-full" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Link
            href={nextHref}
            className="inline-flex h-14 w-full max-w-xs items-center sm:max-w-sm justify-center gap-3 rounded-full bg-[#1f4d36] text-lg font-bold text-white shadow-lg shadow-[#1f4d36]/30 transition hover:bg-[#173d2a] active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4f8a3c]"
          >
            Comenzar
            <ArrowRightIcon className="size-5" />
          </Link>
        </div>
      </div>
    </main>
  );
}
