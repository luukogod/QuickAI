import "@/app/globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next"

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Suithetic",
  description: "Generate secure, private, and efficient synthetic data with Suithetic - powered by SUI blockchain, Atoma Network, Walrus storage, and Seal encryption.",
  authors: [{ name: "Nathan Ranchin", url: "https://nathanrchn.com" }],
  creator: "Nathan Ranchin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
