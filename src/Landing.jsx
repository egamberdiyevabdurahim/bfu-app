import { useEffect } from "react";

/**
 * The marketing site lives as a static bundle at /landing/index.html so it
 * can ship its own Tailwind/Spline/Framer/GSAP stack without bloating the
 * Mini App bundle. When a browser visitor lands on "/", App.jsx hits the
 * publicRoute branch and renders this component, which immediately replaces
 * the URL with the static landing. Telegram users never see this — the
 * detection in App.jsx routes them straight into MiniApp.
 */
export const Landing = () => {
  useEffect(() => {
    window.location.replace("/landing/index.html");
  }, []);
  return (
    <div style={{
      minHeight: "100dvh", background: "#0A0A0F", color: "#A6A6C0",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "system-ui, sans-serif", fontSize: 13,
    }}>
      Loading Bright Futures Uzbekistan…
    </div>
  );
};
