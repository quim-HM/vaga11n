// MediaPipe BlazePose (33 landmarks) -> the COCO-17 "Person" shape used by the tracker and the games.
// Pure module (unit-tested under Node).

// COCO index -> BlazePose index
export const COCO_FROM_BLAZE = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// lm: Float32Array of 33 × (x, y, visibility), normalized. Returns 17 × (x, y, conf), normalized.
export function mapBlazePose(lm) {
  const out = new Float32Array(17 * 3);
  COCO_FROM_BLAZE.forEach((b, i) => {
    out[i * 3] = lm[b * 3];
    out[i * 3 + 1] = lm[b * 3 + 1];
    out[i * 3 + 2] = Math.min(1, Math.max(0, lm[b * 3 + 2]));
  });
  return out;
}

// poses: list of 33-landmark arrays for a w×h frame. With mirror=true, positions are mirrored
// horizontally (like a mirror) and the labels stay anatomical: "r" is the player's own right hand,
// shown on the right of the screen — the same result as vaga11n's frame flip + swap_sides().
export function toPersons(poses, w, h, mirror = true) {
  return poses.map((lm) => {
    const c = mapBlazePose(lm);
    const kpts = [], kconf = [];
    for (let i = 0; i < 17; i++) {
      const x = c[i * 3];
      kpts.push([(mirror ? 1 - x : x) * w, c[i * 3 + 1] * h]);
      kconf.push(c[i * 3 + 2]);
    }
    // Box over all 33 landmarks (the head, hands and feet extend past the COCO points)
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < lm.length / 3; i++) {
      const x = (mirror ? 1 - lm[i * 3] : lm[i * 3]) * w, y = lm[i * 3 + 1] * h;
      x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
    }
    const score = kconf.reduce((a, b) => a + b, 0) / 17;
    return { box: [x1, y1, x2, y2], score, kpts, kconf };
  });
}
