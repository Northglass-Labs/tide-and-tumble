/**
 * The 95th percentile by the nearest-rank method: the smallest sample that
 * at least 95% of the samples do not exceed. With 20 samples that is the
 * 19th smallest, so one slow outlier is forgiven and two are not.
 *
 * @param {number[]} samples
 * @returns {number}
 */
export function p95(samples) {
  if (samples.length === 0) {
    throw new Error("p95 needs at least one sample");
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const value = sorted[Math.ceil(sorted.length * 0.95) - 1];
  if (value === undefined) {
    throw new Error("p95 needs at least one sample");
  }
  return value;
}
