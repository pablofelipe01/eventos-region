"use client";

/**
 * Misión 1: dos preguntas grabadas por voz y pantalla de gracias.
 * Pantallas 3–8 del diseño.
 */
import Link from "next/link";
import { useState } from "react";
import { MISSION_QUESTIONS } from "@/lib/alma/config";
import { ArrowRightIcon } from "./icons";
import { Confetti, Snack } from "./illustrations";
import { Recorder } from "./recorder";
import { AlmaShell, primaryButton } from "./shell";

export function AlmaMission({ nextHref }: { nextHref: string }) {
  const [index, setIndex] = useState(0);
  const question = MISSION_QUESTIONS[index];

  if (!question) {
    return (
      <AlmaShell
        bottom={
          <Link href={nextHref} className={primaryButton}>
            Continuar
            <ArrowRightIcon className="size-5" />
          </Link>
        }
      >
        <div className="relative flex w-full flex-1 flex-col items-center justify-center">
          <Confetti />
          <Snack className="mt-10 h-32 w-auto" />
          <h1 className="mt-6 text-[clamp(2rem,8vw,2.5rem)] font-extrabold">¡Gracias!</h1>
          <p className="mt-3 text-[clamp(1.125rem,4.8vw,1.35rem)] leading-relaxed text-[#2f4a3c]">
            Ya completaste
            <br />
            tu primera misión.
          </p>
          <div className="mt-8 flex w-full max-w-sm items-center gap-3 rounded-2xl bg-[#dfe9d2] px-4 py-3 text-left">
            <svg viewBox="0 0 24 24" className="size-7 shrink-0 text-[#1f4d36]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="8" width="18" height="13" rx="2" />
              <path d="M12 8v13M3 12h18M12 8c-3 0-5-1.5-5-3.5S9.5 2 12 5c2.5-3 5-2.5 5-.5S15 8 12 8Z" />
            </svg>
            <p className="text-[clamp(1rem,4.2vw,1.125rem)] leading-snug">
              <span className="font-bold">Ahora reclama</span>
              <br />
              tu bebida y tu refrigerio.
            </p>
          </div>
        </div>
      </AlmaShell>
    );
  }

  return (
    <AlmaShell step={index + 1}>
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <h1 className="w-full text-[clamp(1.5rem,6.5vw,2.25rem)] leading-tight font-extrabold text-balance">{question.title}</h1>
        {question.hint && <p className="mt-3 max-w-sm text-[clamp(1.05rem,4.4vw,1.2rem)] leading-snug text-[#2f4a3c] sm:max-w-md">{question.hint}</p>}
        <div className="mt-10 w-full sm:mt-14">
          <Recorder
            key={question.id}
            station="Misión 1"
            question={question.hint ? `${question.title}: ${question.hint}` : question.title}
            onDone={() => setIndex((i) => i + 1)}
          />
        </div>
      </div>
    </AlmaShell>
  );
}
