import type { Metadata } from "next";
import { AlmaMission } from "@/components/alma/mission";

export const metadata: Metadata = { title: "Alma — Misión 1" };

export default function MisionPage() {
  return <AlmaMission nextHref="/alma/mesa" />;
}
