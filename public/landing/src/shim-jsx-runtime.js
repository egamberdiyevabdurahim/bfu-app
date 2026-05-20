// react/jsx-runtime shim — uses globalThis.React (UMD).
const R = globalThis.React;
if (!R) throw new Error('React UMD must load before this shim');

const REACT_FRAGMENT = R.Fragment;

function jsx(type, props, key) {
  const { children, ...rest } = props || {};
  if (key !== undefined) rest.key = key;
  if (children === undefined) return R.createElement(type, rest);
  if (Array.isArray(children)) return R.createElement(type, rest, ...children);
  return R.createElement(type, rest, children);
}

export { jsx, jsx as jsxs, jsx as jsxDEV, REACT_FRAGMENT as Fragment };
export default { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: REACT_FRAGMENT };
