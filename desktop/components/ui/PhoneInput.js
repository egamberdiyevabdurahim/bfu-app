"use client";

import { toLocalPhone, fullPhone, PHONE_LOCAL_LEN } from "@/lib/phone";

// A phone field with a FIXED "+998" prefix rendered as chrome. The CALLER holds
// the full value (e.g. "+998911853616"); this shows the prefix and lets the user
// type only the 9 local digits (non-digits stripped, capped at 9). onChange
// emits the full value ("" when the field is empty).
//
// `baseStyle` is the caller's normal input style (border / background / radius /
// width) — it is applied to the wrapper so the field looks identical to its
// neighbours, and the inner <input> is borderless/transparent inside it.
export default function PhoneInput({
  value,
  onChange,
  baseStyle = {},
  invalid = false,
  inputRef,
  inputProps = {},
}) {
  const local = toLocalPhone(value);
  const wrap = {
    ...baseStyle,
    display: "flex",
    alignItems: "center",
    padding: 0,
    overflow: "hidden",
    ...(invalid ? { borderColor: "rgba(192,86,59,0.55)" } : null),
  };
  return (
    <div style={wrap}>
      <span
        aria-hidden
        style={{
          flex: "0 0 auto",
          padding: "12px 8px 12px 14px",
          color: "var(--muted-strong)",
          fontFamily: "var(--font-body)",
          fontSize: 15,
          borderRight: "1px solid var(--hair)",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        +998
      </span>
      <input
        {...inputProps}
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={PHONE_LOCAL_LEN}
        value={local}
        onChange={(e) => onChange(fullPhone(e.target.value))}
        placeholder="911853616"
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text)",
          fontFamily: "var(--font-body)",
          fontSize: 15,
          padding: "12px 14px 12px 10px",
          letterSpacing: "0.02em",
        }}
      />
    </div>
  );
}
