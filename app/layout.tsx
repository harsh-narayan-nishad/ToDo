import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pacewise To-do",
  description: "Tasks, time worked and consistency, linked to your Pacewise calendar.",
};

/** `viewport-fit=cover` so env(safe-area-inset-bottom) is real: the phone tab bar keeps its height above the home indicator when the browser's toolbar collapses on scroll. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Before the page paints: the picked theme, or light on phones, so a phone never flashes dark first. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var c=localStorage.getItem("pacewise-todo-theme-choice");document.documentElement.setAttribute("data-theme",c?c:(matchMedia("(max-width: 767px)").matches?"light":"dark"))}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body className="bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
