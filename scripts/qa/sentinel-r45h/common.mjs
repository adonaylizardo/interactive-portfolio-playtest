globalThis.window = globalThis;
const S = (await import('./pixi-stub.mjs')).default;
export async function load(b='./bundle.mjs') {
  await import(b); const T = globalThis.__T;
  const obj = T.objects.find(o => o.id === 'fill/jac-t9');
  const jac = new T.JacT9(obj, { container: S, visual: new Proxy({}, { get: () => S }), tapBox: new Map(), onStuck: () => { jac.__stuck = (jac.__stuck||0)+1; } });
  jac.setMode('drive');
  return { T, jac };
}
export const P = (j) => j.poseBlocked(j.cx, j.cy, j.dir);
