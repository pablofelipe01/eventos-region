import type { Metadata } from "next";
import { AlmaTable } from "@/components/alma/table";

export const metadata: Metadata = { title: "Alma — Mesa de las herramientas" };

export default function MesaPage() {
  return <AlmaTable />;
}
