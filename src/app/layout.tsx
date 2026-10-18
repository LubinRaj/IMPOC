import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "./globals.css";
import { Shell } from "@/components/shell";
import { TooltipProvider } from "@/components/ui/tooltip";
export const metadata: Metadata = {
  title: "IMPOC | Infrastructure Inventory",
  description: "Simulated multi-cloud inventory and synchronization control",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider delay={250}>
          <Shell>{children}</Shell>
        </TooltipProvider>
      </body>
    </html>
  );
}
