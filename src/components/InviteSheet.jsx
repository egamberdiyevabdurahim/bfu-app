import { useState, useEffect } from "react";
import { users } from "../api";
import { Icon } from "./Icons";
import { useT } from "../i18n";
import { shareUrl, shareToStory, canShareStory, tgAlert } from "../tg";

// ── Invite friends + referral leaderboard + Story-share ───────────────────────
// Full-screen overlay (Chorsu). Ported from the legacy SettingsScreen InviteCard;
// a big viral lever for the ~1000-builder seed. Uses the existing invite/
// leaderboard/card endpoints + invite.* i18n keys.

export const InviteSheet = ({ onClose }) => {
  const { t } = useT();
  const [data, setData] = useState(null);       // {link, invited_count}
  const [board, setBoard] = useState(null);     // {top:[{rank,name,count,is_me}]}
  const [copied, setCopied] = useState(false);
  const [sharingStory, setSharingStory] = useState(false);

  useEffect(() => {
    users.invite().then(setData).catch(() => {});
    users.leaderboard().then(setBoard).catch(() => {});
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(data.link); } catch { /* blocked */ }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const shareStory = async () => {
    setSharingStory(true);
    try {
      const c = await users.card();
      const ok = shareToStory(c.card_url, { text: t("invite.storyText"), linkUrl: c.ref_link, linkName: "Bright Futures" });
      if (!ok) tgAlert(t("invite.storyUnsupported"));
    } catch (e) { tgAlert(e.message); }
    setSharingStory(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 260, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      "--muted": "#A8A093", "--muted-strong": "#C6BEAF",
    }}>
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12,
        padding: "calc(var(--safe-t) + 14px) 16px 14px", borderBottom: "1px solid var(--hair)",
      }}>
        <button onClick={onClose} aria-label={t("common.close")} style={{
          width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
          background: "var(--surface-2)", color: "var(--muted-strong)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><Icon name="x" size={18} /></button>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, color: "var(--text)" }}>
          {t("invite.title")}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "18px 16px 40px" }}>
        {!data ? (
          <div style={{ textAlign: "center", padding: 50, color: "var(--text-3)" }}>
            <Icon name="loader" size={22} color="var(--amber)" />
          </div>
        ) : (
          <>
            <div className="ch-cell-static" style={{
              background: "linear-gradient(150deg, rgba(232,161,92,0.12), var(--surface) 60%)",
              borderColor: "rgba(232,161,92,0.35)",
            }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text)" }}>
                🎁 {t("invite.title")}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5, marginBottom: 12 }}>
                {t("invite.desc")}
              </div>
              <div style={{
                background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
                padding: "10px 12px", fontSize: 12, color: "var(--muted-strong)", wordBreak: "break-all", marginBottom: 10,
              }}>{data.link}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={copy} style={{
                  flex: 1, padding: 11, background: "var(--surface-2)", border: "1px solid var(--hair)",
                  borderRadius: "var(--radius-sm)", color: "var(--text)", fontWeight: 600, fontSize: 13.5,
                  cursor: "pointer", fontFamily: "var(--font-body)",
                }}>{copied ? t("invite.copied") : t("invite.copy")}</button>
                <button onClick={() => shareUrl(data.link, t("invite.shareText"))} className="btn-primary"
                  style={{ flex: 1, width: "auto", padding: 11, fontSize: 13.5 }}>
                  {t("invite.share")}
                </button>
              </div>
              {canShareStory() && (
                <button onClick={shareStory} disabled={sharingStory} style={{
                  width: "100%", marginTop: 10, padding: 12, border: "none", borderRadius: "var(--radius-sm)",
                  background: "linear-gradient(135deg, var(--ember), var(--terra))", color: "#160E08",
                  fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "var(--font-display)",
                  opacity: sharingStory ? 0.6 : 1,
                }}>{sharingStory ? t("invite.storyMaking") : `✦ ${t("invite.storyBtn")}`}</button>
              )}
              <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: "var(--amber)", textAlign: "center" }}>
                {t("invite.count", { n: data.invited_count })}
              </div>
            </div>

            {board && (
              <div className="ch-cell-static" style={{ marginTop: 12 }}>
                <div className="ch-cell-label">{t("invite.leaderboard")}</div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                  {board.top?.length ? board.top.map((r) => (
                    <div key={r.rank} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 4px", fontSize: 14,
                      color: r.is_me ? "var(--amber)" : "var(--text)", fontWeight: r.is_me ? 700 : 500,
                      borderBottom: "1px solid var(--hair)",
                    }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", width: 20 }}>{r.rank}</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.name}{r.is_me ? ` (${t("invite.you")})` : ""}
                        </span>
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{r.count}</span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 13, color: "var(--text-3)", padding: "8px 4px" }}>{t("invite.noLeaders")}</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
