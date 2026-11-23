const mk = () => new Proxy(function () {}, {
  get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (!(p in t)) t[p] = mk(); return t[p]; },
  set(t, p, v) { t[p] = v; return true; },
  apply() { return mk(); }, construct() { return mk(); },
});
export const Assets = mk(), Container = mk(), Graphics = mk(), Rectangle = mk(), Sprite = mk(), Texture = mk();
export default mk();
