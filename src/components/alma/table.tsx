"use client";

/**
 * Mesa de las herramientas: elegir un objeto y contar una historia (pantalla 9
 * del diseño), con el mismo grabador de la misión.
 */
import { useState } from "react";
import { OBJECTS, TABLE_QUESTION, type AlmaObject } from "@/lib/alma/config";
import { SproutIcon } from "./icons";
import { Boots, Confetti, Fruits, Hat, Machete } from "./illustrations";
import { Recorder } from "./recorder";
import { AlmaShell } from "./shell";

const ICONS: Record<AlmaObject, (p: { className?: string }) => React.ReactNode> = {
  Machete,
  Sombrero: Hat,
  Botas: Boots,
  Frutos: Fruits,
};

export function AlmaTable() {
  const [selected, setSelected] = useState<AlmaObject | null>(null);
  const [done, setDone] = useState(false);
  const [recording, setRecording] = useState(false);

  if (done) {
    return (
      <AlmaShell>
        <div className="relative flex w-full flex-1 flex-col items-center justify-center">
          <Confetti />
          <SproutIcon className="size-16 text-[#4f8a3c]" />
          <h1 className="mt-6 text-[clamp(2rem,8vw,2.5rem)] font-extrabold">¡Gracias!</h1>
          <p className="mt-3 max-w-xs text-[#2f4a3c] sm:max-w-sm sm:text-lg">
            Tu historia ya hace parte de la memoria de Las Moras. Puedes devolver el celular.
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
          object={selected ?? undefined}
          trigger={{ label: "¡Vamos!", disabled: !selected }}
          onStart={() => setRecording(true)}
          onDone={() => setDone(true)}
        />
      }
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <h1 className="w-full text-[clamp(1.4rem,6vw,2rem)] leading-tight font-extrabold text-balance">
          Ahora vamos a la mesa de las herramientas.
        </h1>
        <div className="mt-6 grid w-full max-w-sm grid-cols-4 gap-2 sm:max-w-md sm:gap-3" role="radiogroup" aria-label="Elige un objeto">
          {OBJECTS.map((name) => {
            const Icon = ICONS[name];
            const active = selected === name;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={recording}
                onClick={() => setSelected(name)}
                className={`flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-white p-1 shadow-sm transition active:scale-95 disabled:active:scale-100 sm:p-2 ${
                  active ? "border-[#1f4d36] ring-2 ring-[#1f4d36]/20" : "border-transparent"
                } ${recording && !active ? "opacity-40" : ""}`}
              >
                <Icon className="size-10 sm:size-14" />
                <span className="text-[10px] font-semibold sm:text-xs">{name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-6 max-w-sm text-[15px] leading-snug text-[#2f4a3c] sm:text-base">
          <span className="font-bold">Cada herramienta tiene una historia.</span>
          <br />
          Observa los objetos que encontrarás sobre la mesa. Elige uno que te recuerde algo de tu vida y cuéntanos
          tu historia.
        </p>
      </div>
    </AlmaShell>
  );
}
