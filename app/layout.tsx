import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pacewise To-do",
  description: "Tasks, time worked and consistency, linked to your Pacewise calendar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body className="bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
