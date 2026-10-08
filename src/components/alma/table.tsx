"use client";

/**
 * Mesa de las herramientas (pantalla 9 del diseño): la persona elige un objeto
 * en la mesa física y cuenta su historia con el mismo grabador de la misión.
 * La ilustración es de referencia; "¡Vamos!" empieza a grabar.
 */
import { useState } from "react";
import { TABLE_QUESTION } from "@/lib/alma/config";
import { SproutIcon } from "./icons";
import { Confetti } from "./illustrations";
import { ObjectTable } from "./object-table";
import { Recorder } from "./recorder";
import { AlmaShell } from "./shell";

export function AlmaTable() {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AlmaShell>
        <div className="relative flex w-full flex-1 flex-col items-center justify-center">
          <Confetti />
          <SproutIcon className="size-16 text-[#4f8a3c]" />
          <h1 className="mt-6 text-[clamp(2rem,8vw,2.5rem)] font-extrabold">¡Gracias!</h1>
          <p className="mt-4 max-w-sm text-[clamp(1.125rem,4.8vw,1.35rem)] leading-relaxed text-[#2f4a3c] sm:max-w-md">
            Ahora ingresa y toma un asiento, que está próximo a empezar el taller.
          </p>
        </div>
      </AlmaShell>
    );
  }

  return (
    <AlmaShell
      step={2}
      bottom={
        <Recorder
          station="Mesa de las herramientas"
          question={TABLE_QUESTION}
          trigger={{ label: "¡Vamos!" }}
          onDone={() => setDone(true)}
        />
      }
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <h1 className="w-full text-[clamp(1.4rem,6vw,2rem)] leading-tight font-extrabold text-balance">
          Ahora vamos a la mesa de las herramientas.
        </h1>
        <div className="mt-6 w-full">
          <div className="flex justify-center">
            <ObjectTable />
          </div>
        </div>
        <p className="mt-6 max-w-sm text-[clamp(1.05rem,4.4vw,1.2rem)] leading-snug text-[#2f4a3c] sm:max-w-md">
          <span className="font-bold">Cada herramienta tiene una historia.</span>
          <br />
          Observa los objetos que encontrarás sobre la mesa. Elige uno que te recuerde algo de tu vida y cuéntanos
          tu historia.
        </p>
      </div>
    </AlmaShell>
  );
}
