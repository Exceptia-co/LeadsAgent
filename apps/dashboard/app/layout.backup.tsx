import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { SWRConfig } from "swr";
import { swrConfig } from "../lib/swr-config";
import { ToastProvider } from "../components/ToastProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeadsCRM Dashboard",
  description: "Sistema de gestión de leads con automatización WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="es">
        <body className={inter.className}>
          <SWRConfig value={swrConfig}>
            <ToastProvider>{children}</ToastProvider>
          </SWRConfig>
        </body>
      </html>
    </ClerkProvider>
  );
}
