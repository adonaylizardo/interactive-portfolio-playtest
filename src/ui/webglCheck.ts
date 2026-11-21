/** Up-front probe — distinct from runtime asset / init failures (`carga-fallida`). */
export function canUseWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}
