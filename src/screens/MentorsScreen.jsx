import { useState, useEffect } from "react";
import { mentors } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";
import { Page, AvatarEl, SkeletonList } from "../components/Shared";
import { UserProfileModal } from "../components/UserProfileModal";
import { BookSlotSheet } from "../components/MentorSheets";

// Mentors tab — mirrors the desktop Chorsu "Bazaar" Mentors page
// (desktop/app/mentors/page.js + desktop/components/community/MentorsBrowser.js),
// mobile single-column. Loads GET /mentors → each mentor is
//   { id, display_name, photo_url, bio, topics:[], open_slots:int }.
// Tapping a mentor's name/avatar opens their profile; "Book a session" opens the
// existing MentorSheets booking sheet (slots + note → POST /bookings).
//
// Signature is prop-free by default (used as a top-level tab), but keeps the
// optional `onClose` so the current SettingsScreen overlay usage
// (<MentorsScreen onClose={…} />) still gets a working back button.
export const MentorsScreen = ({ onClose } = {}) => {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [viewingId, setViewingId] = useState(null); // open UserProfileModal
  const [booking, setBooking] = useState(null);      // mentor obj → BookSlotSheet

  useEffect(() => {
    mentors.list()
      .then((r) => setList(Array.isArray(r) ? r : []))
      .catch((e) => { tgAlert(e.message); setList([]); });
  }, []);

  return (
    <Page>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 20px 0" }}>
        {onClose && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              className="btn-ghost"
              onClick={onClose}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              {t("common.back")}
            </button>
          </div>
        )}

        {/* Firelit Chorsu header: mono eyebrow · Bricolage title w/ serif-italic
            amber accent · Instrument-Serif subtitle */}
        <div className="ch-eyebrow">{t("mentor.kicker")}</div>
        <h1 className="ch-h1">
          {t("mentor.titleLead")}{" "}
          <span className="accent-serif">{t("mentor.titleAccent")}</span>
        </h1>
        <p className="ch-sub">{t("mentor.subtitle")}</p>
      </div>

      <div style={{ padding: "22px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {list === null ? (
          <SkeletonList count={4} />
        ) : list.length === 0 ? (
          <div className="ch-grace">
            <span className="ch-grace-k">{t("mentor.kicker")}</span>
            <div className="ch-grace-t">{t("mentor.emptyTitle")}</div>
            <div className="ch-grace-s">{t("mentor.emptyBody")}</div>
          </div>
        ) : (
          list.map((m, i) => {
            const name = m.display_name || t("mentor.builderFallback");
            const topics = Array.isArray(m.topics) ? m.topics.slice(0, 5) : [];
            const hasSlots = (m.open_slots || 0) > 0;
            return (
              <div
                key={m.id}
                className="ch-cell-static"
                style={{ padding: 18, animation: `fadeUp ${0.1 + i * 0.05}s ease` }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <button
                    onClick={() => setViewingId(m.id)}
                    aria-label={name}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
                  >
                    <AvatarEl name={name} size={52} photoUrl={m.photo_url} />
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      onClick={() => setViewingId(m.id)}
                      style={{
                        background: "none", border: "none", padding: 0, cursor: "pointer",
                        textAlign: "left", display: "block", maxWidth: "100%",
                        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17,
                        letterSpacing: "-0.01em", color: "var(--text)",
                      }}
                    >
                      {name}
                    </button>

                    {m.bio && (
                      <p className="ch-card-bld" style={{ marginTop: 5 }}>{m.bio}</p>
                    )}

                    {topics.length > 0 && (
                      <div className="ch-card-tags">
                        {topics.map((tp, j) => (
                          <span key={`${tp}-${j}`} className="ch-card-t">{tp}</span>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 12,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        color: hasSlots ? "var(--green)" : "var(--text-3)",
                      }}
                    >
                      {hasSlots ? t("mentor.openSlots", { n: m.open_slots }) : t("mentor.noSlots")}
                    </div>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  onClick={() => setBooking(m)}
                  style={{ marginTop: 16 }}
                >
                  {t("mentor.book")}
                </button>
              </div>
            );
          })
        )}
      </div>

      {viewingId && <UserProfileModal userId={viewingId} onClose={() => setViewingId(null)} />}
      {booking && <BookSlotSheet mentor={booking} onClose={() => setBooking(null)} />}
    </Page>
  );
};
