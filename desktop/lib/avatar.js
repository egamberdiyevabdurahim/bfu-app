const GRADS = [
  ["#E8A15C", "#C0563B"], ["#F0B429", "#C0563B"], ["#5EC5B6", "#12564F"],
  ["#7FB069", "#12564F"], ["#FF6A3D", "#C0563B"], ["#E8A15C", "#12564F"],
  ["#F0B429", "#FF6A3D"], ["#C0563B", "#7A2E1E"],
];
export function gradientFor(seed) {
  const g = GRADS[Math.abs(Number(seed) || 0) % GRADS.length];
  return `linear-gradient(140deg,${g[0]},${g[1]})`;
}
export function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
