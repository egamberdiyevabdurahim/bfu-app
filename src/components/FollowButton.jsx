import { useState } from "react";
import { users } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

/**
 * Reusable follow toggle for a user or a project.
 * Props: targetType ("user"|"project"), targetId, initialFollowing, initialCount,
 *        onChange?(following, count)
 */
export const FollowButton = ({ targetType, targetId, initialFollowing = false, initialCount = 0, onChange }) => {
  const { t } = useT();
  const [following, setFollowing] = useState(!!initialFollowing);
  const [count, setCount] = useState(initialCount || 0);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        await users.unfollow(targetType, targetId);
        const next = Math.max(0, count - 1);
        setFollowing(false); setCount(next); onChange?.(false, next);
      } else {
        const r = await users.follow(targetType, targetId);
        const next = r?.follower_count ?? count + 1;
        setFollowing(true); setCount(next); onChange?.(true, next);
      }
    } catch (e) { tgAlert(e.message); }
    setBusy(false);
  };

  return (
    <button onClick={toggle} disabled={busy} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 16px",
      background: following ? "var(--surface-2)" : "var(--accent)",
      border: following ? "1px solid var(--border)" : "none",
      borderRadius: "var(--radius-sm)",
      color: following ? "var(--text-2)" : "#fff",
      fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-display)",
    }}>
      {following ? `✓ ${t("follow.following")}` : t("follow.btn")}
    </button>
  );
};
