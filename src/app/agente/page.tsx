import type { Metadata } from "next";
import { Assistant } from "@/components/assistant/assistant";

export const metadata: Metadata = {
  title: "Región — Asistente de IA",
};

export default function AgentePage() {
  return <Assistant />;
}
