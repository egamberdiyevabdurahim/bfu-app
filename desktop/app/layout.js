import "./globals.css";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getServerLang } from "@/lib/i18n/server";

export const metadata = {
  title: "Bright Futures Uzbekistan",
  description: "A city of builders, lit up at dusk.",
};

export default async function RootLayout({ children }) {
  const lang = await getServerLang();
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <LocaleProvider lang={lang}>
          <SmoothScrollProvider>{children}</SmoothScrollProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
