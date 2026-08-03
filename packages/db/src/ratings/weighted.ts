/**
 * The Bayesian (weighted) average behind every ranked chart.
 *
 *   W = (v / (v + m)) · R + (m / (v + m)) · C
 *
 * where `v` is the vote count, `R` the raw mean, `m` the minimum-votes
 * threshold for the chart, and `C` the prior mean across eligible titles.
 *
 * This is what stops a title with nine 10s from outranking a classic with
 * 900,000 votes averaging 9.2: with few votes the score is pulled toward the
 * prior, and it only escapes as the evidence accumulates.
 */
export function weightedRating(
  voteCount: number,
  rawAverage: number,
  minimumVotes: number,
  priorMean: number,
): number {
  if (voteCount <= 0) return priorMean;
  if (minimumVotes <= 0) return rawAverage;
  const denominator = voteCount + minimumVotes;
  return (voteCount / denominator) * rawAverage + (minimumVotes / denominator) * priorMean;
}

/**
 * Mean of the eligible population — the `C` term. Computed from the same set
 * a chart ranks, so the prior reflects that chart rather than the whole
 * catalog (TV and film rate differently).
 */
export function priorMeanOf(
  candidates: Array<{ voteCount: number; average: number }>,
  fallback: number,
): number {
  const totalVotes = candidates.reduce((sum, c) => sum + c.voteCount, 0);
  if (totalVotes === 0) return fallback;
  const weighted = candidates.reduce((sum, c) => sum + c.average * c.voteCount, 0);
  return weighted / totalVotes;
}

/** Round to two decimals the way a rating is displayed, without float drift. */
export function roundRating(value: number): number {
  return Math.round(value * 100) / 100;
}
