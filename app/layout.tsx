import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealRadar — LCBO deals tracker",
  description: "Tracking LCBO deals, stock, and drops across Ontario.",
};

// Radix Themes' own dark-mode CSS is gated behind a .dark/.dark-theme
// ancestor class -- <Theme appearance="inherit"> (below) adds neither class
// itself, it only inherits one that's already present. This blocking
// inline script (runs before paint, no React involved) sets that class
// from prefers-color-scheme so the site keeps following the OS
// automatically with no manual toggle and no flash of the wrong theme, and
// stays in sync if the OS theme changes while the tab is open.
const THEME_SCRIPT = `(function () {
  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  function apply(isDark) {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }
  apply(mql.matches);
  mql.addEventListener("change", function (e) { apply(e.matches); });
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Theme appearance="inherit" accentColor="ruby" radius="medium">
          <div className="page">{children}</div>
        </Theme>
      </body>
    </html>
  );
}
