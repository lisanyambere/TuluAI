import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tulu facility dashboard",
  description: "Coordinate verified healthcare access requests for Tulu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
