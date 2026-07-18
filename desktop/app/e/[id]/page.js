import { notFound } from "next/navigation";
import { asset } from "@/lib/asset";
import { getPublicEvent } from "@/lib/bfu-api";
import { getT } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/datetime";

// PUBLIC event landing page (/web/e/{id}, reached at brightfuturesuzbekistan.uz/e/{id}
// via the Mini App's /e/:id rewrite). No login — this is the link Marstiff shares on
// Instagram. It shows the mock-exam beautifully with a rich OG preview and one clear
// CTA: "Ro'yxatdan o'tish" → opens Telegram straight onto the event's registration
// (the deep-link deferred flow handles new users through signup first).
export const dynamic = "force-dynamic";

const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || "BrightFuturesUzbekistan_bot";

const TYPE_STYLE = {
  hackathon: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  grant: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  scholarship: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  meetup: { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)", bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" };

// Self-contained trilingual copy (the public page carries no locale cookie for a
// first-time Instagram visitor, so it doesn't depend on the app's i18n dicts).
const L = {
  uz: { register: "Ro'yxatdan o'tish", starts: "Boshlanishi", deadline: "Ro'yxat yopiladi", where: "Manzil", seatsLeft: (n) => `${n} ta joy qoldi`, full: "Joylar to'ldi — navbatga yozilish", hostedBy: "Tashkilotchi", opensTg: "Telegram ilovasida ochiladi", tagline: "Yorqin kelajak shu yerdan boshlanadi." },
  ru: { register: "Зарегистрироваться", starts: "Начало", deadline: "Приём заявок до", where: "Место", seatsLeft: (n) => `Осталось мест: ${n}`, full: "Мест нет — запись в лист ожидания", hostedBy: "Организатор", opensTg: "Откроется в Telegram", tagline: "Яркое будущее начинается здесь." },
  en: { register: "Register", starts: "Starts", deadline: "Registration closes", where: "Location", seatsLeft: (n) => `${n} seats left`, full: "Full — join the waitlist", hostedBy: "Hosted by", opensTg: "Opens in Telegram", tagline: "A brighter future starts here." },
};

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ev = await getPublicEvent(id);
  if (!ev) return { title: "Event — Bright Futures Uzbekistan" };
  const host = ev.partner_name ? `${ev.partner_name} · ` : "";
  const title = `${ev.title} — ${host}Bright Futures Uzbekistan`;
  const description = (ev.description || "Register for this opportunity on Bright Futures Uzbekistan").slice(0, 180);
  // Use the event's own cover as the share image when set (a real, per-event
  // preview for Instagram/Telegram); otherwise the brand mark.
  const image = ev.cover_url || asset("/bfu-mark.png");
  const url = `https://brightfuturesuzbekistan.uz/e/${ev.id}`;
  return {
    metadataBase: new URL("https://brightfuturesuzbekistan.uz"),
    title, description,
    openGraph: { title, description, url, siteName: "Bright Futures Uzbekistan",
      images: [{ url: image, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

function Fact({ glyph, label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span aria-hidden style={{ flex: "0 0 auto", fontSize: 15 }}>{glyph}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
        <div style={{ marginTop: 2, fontSize: 15, color: "var(--text)", lineHeight: 1.45, overflowWrap: "anywhere" }}>{children}</div>
      </div>
    </div>
  );
}

export default async function PublicEventPage({ params }) {
  const { lang } = await getT();
  const { id } = await params;
  const ev = await getPublicEvent(id);
  if (!ev) notFound();

  const t = L[lang] || L.uz;
  const style = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const starts = fmtDateTime(ev.starts_at);
  const deadline = fmtDate(ev.deadline);
  const cover = ev.cover_url ? asset(ev.cover_url) : null;
  const registerUrl = `https://t.me/${BOT}?startapp=event_${ev.id}`;

  // Seats copy: gentle scarcity only when the room is filling (≤10) or full.
  let seats = null;
  if (ev.capacity != null) {
    const left = ev.seats_left;
    if (typeof left === "number" && left > 0 && left <= 10) seats = t.seatsLeft(left);
    else if (typeof left === "number" && left <= 0) seats = t.full;
  }
  const mapUrl = (ev.lat != null && ev.lng != null)
    ? `https://yandex.com/maps/?pt=${ev.lng},${ev.lat}&z=17&l=map` : null;

  return (
    <main style={{ position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "36px 18px 48px" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("/bfu-mark.png")} alt="Bright Futures Uzbekistan"
          style={{ height: 40, width: "auto", display: "block", margin: "0 auto 22px", filter: "drop-shadow(0 2px 16px rgba(232,161,92,0.3))" }} />

        <div className="ch-cell-static" style={{ overflow: "hidden", padding: 0,
          background: "linear-gradient(160deg, rgba(232,161,92,0.06), rgba(192,86,59,0.04) 55%, var(--surface))" }}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={ev.title}
              style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block", borderBottom: "1px solid var(--hair)" }} />
          ) : null}

          <div style={{ padding: "24px 26px 26px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "5px 12px", borderRadius: "var(--radius-pill)",
              background: style.bg, border: `1px solid ${style.bd}`, color: style.color,
              fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {ev.type || "event"}
            </span>

            <h1 style={{ margin: "14px 0 0", fontFamily: "var(--font-display)", fontWeight: 700,
              fontSize: "clamp(24px, 6vw, 32px)", lineHeight: 1.12, letterSpacing: "-0.02em", color: "var(--text)" }}>
              {ev.title}
            </h1>

            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
              {starts ? <Fact glyph="◷" label={t.starts}>{starts}</Fact> : null}
              {ev.location ? (
                <Fact glyph="📍" label={t.where}>
                  {ev.location}
                  {mapUrl ? <> · <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber)", textDecoration: "none" }}>Yandex ↗</a></> : null}
                </Fact>
              ) : null}
              {deadline ? <Fact glyph="⏰" label={t.deadline}>{deadline}</Fact> : null}
              {seats ? <Fact glyph="◎" label="—">{seats}</Fact> : null}
              {ev.partner_name ? <Fact glyph="✦" label={t.hostedBy}>{ev.partner_name}</Fact> : null}
            </div>

            {ev.description ? (
              <p style={{ margin: "18px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--muted-strong)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {ev.description}
              </p>
            ) : null}

            <a href={registerUrl} className="ch-btn-primary"
              style={{ marginTop: 24, width: "100%", justifyContent: "center", fontSize: 16, padding: "15px 20px" }}>
              🎟 {t.register}
            </a>
            <div style={{ marginTop: 9, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", color: "var(--muted)" }}>
              {t.opensTg}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 15, color: "var(--muted)" }}>
          {t.tagline}
        </div>
      </div>
    </main>
  );
}
