import type { Metadata, Viewport } from "next";
import { AlmaWelcome } from "@/components/alma/welcome";

export const metadata: Metadata = {
  title: "Alma — Las Moras",
  description: "Alma quiere conocerte: cuéntanos tus historias para tejer un futuro mejor en las moras.",
};

export const viewport: Viewport = {
  themeColor: "#dbe9ea",
  viewportFit: "cover",
};

export default function Home() {
  return <AlmaWelcome nextHref="/alma/mision" />;
}
