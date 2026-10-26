// Vectorised One Euro filter (Casiez et al., 2012) for keypoint smoothing. Port of vaga11n/filters.py.

export class OneEuro {
  constructor(minCutoff = 1.5, beta = 0.5, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() { this.xPrev = this.dxPrev = this.tPrev = null; }

  // x: array of numbers, t: seconds. Returns a new Float64Array.
  filter(x, t) {
    const n = x.length;
    if (this.xPrev === null || this.tPrev === null || this.xPrev.length !== n) {
      this.xPrev = Float64Array.from(x);
      this.dxPrev = new Float64Array(n);
      this.tPrev = t;
      return Float64Array.from(x);
    }
    const dt = Math.max(t - this.tPrev, 1e-3);
    const aD = alpha(this.dCutoff, dt);
    const out = new Float64Array(n);
    const dxHat = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const dx = (x[i] - this.xPrev[i]) / dt;
      dxHat[i] = aD * dx + (1 - aD) * this.dxPrev[i];
      const a = alpha(this.minCutoff + this.beta * Math.abs(dxHat[i]), dt);
      out[i] = a * x[i] + (1 - a) * this.xPrev[i];
    }
    this.xPrev = out;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return Float64Array.from(out);
  }
}

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}
