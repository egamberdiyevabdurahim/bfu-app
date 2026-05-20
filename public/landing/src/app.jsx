// app.jsx — Root component that composes everything
const { useState, useEffect } = React;

function App() {
  const reduced = useReducedMotionFlag();
  useLenisScroll(reduced);
  const ready = useLibsReady();

  // Don't block first paint: render immediately with graceful fallbacks
  // (Framer/GSAP guards are inside each component.)
  return (
    <>
      <CursorBlob />
      <ScrollProgressBar />
      <Topbar />

      <main className="relative">
        <Hero reduced={reduced} />
        <Manifesto reduced={reduced} />
        <ProductFilm reduced={reduced} />
        <FeatureGrid />
        <RegionsMap reduced={reduced} />
        <BotMarquee />
        <AIMatchingDemo reduced={reduced} />
        <LeaderboardSection reduced={reduced} />
        <TrustSafety />
        <Partners />
        <FAQ />
        <FinalCTA />
        <Footer />
      </main>

      {/* tiny ready hint, hidden visually */}
      <div aria-hidden className="sr-only">{ready ? 'ready' : 'loading'}</div>
    </>
  );
}

window.App = App;

// --- mount ---
function mountApp() {
  const root = document.getElementById('root');
  if (!root) return;
  if (!window.ReactDOM || !window.React) {
    setTimeout(mountApp, 30);
    return;
  }
  const r = ReactDOM.createRoot(root);
  r.render(<App />);
}

mountApp();
