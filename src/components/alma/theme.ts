import { Nunito } from "next/font/google";

/** Tipografía redondeada y cálida de Alma (solo en sus pantallas). */
export const almaFont = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-alma",
});
