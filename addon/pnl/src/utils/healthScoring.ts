/**
 * Health Scoring Utilities
 *
 * This file contains all the scoring logic for the Portfolio Health Check feature.
 * The health score is calculated on a 100-point scale across 5 categories.
 * Lower scores indicate worse health.
 *
 * SCORING BREAKDOWN (100 points max):
 * 1. ABSOLUTE RETURN (25 points) - Based on Extended Internal Rate of Return (XIRR)
 * 2. RELATIVE RETURN (25 points) - Based on Alpha vs benchmark
 * 3. UNDERWATER ANALYSIS (20 points) - Based on time spent below cost basis
 * 4. RISK/VOLATILITY (15 points) - Based on Sharpe ratio
 * 5. DIVIDEND HEALTH (15 points) - Based on dividend trend (redistributed for non-dividend stocks)
 */

import type {
  DividendTrend,
  HealthCheckConfig,
  HealthFlag,
  HealthMetrics,
  HealthRecommendation,
  Severity,
} from '../types/healthCheck';

/**
 * Score based on XIRR (Extended Internal Rate of Return)
 *
 * 25 pts: XIRR >= 10%   (excellent)
 * 20 pts: XIRR >= 7%    (good)
 * 15 pts: XIRR >= 4%    (acceptable)
 * 10 pts: XIRR >= 0%    (break-even)
 * 5 pts:  XIRR >= -5%   (minor loss)
 * 0 pts:  XIRR < -5%    (significant loss)
 */
export function calculateAbsoluteReturnScore(xirr: number): number {
  if (xirr >= 10) return 25;
  if (xirr >= 7) return 20;
  if (xirr >= 4) return 15;
  if (xirr >= 0) return 10;
  if (xirr >= -5) return 5;
  return 0;
}

/**
 * Score based on Alpha (return vs benchmark)
 *
 * 25 pts: Alpha >= 5%    (beating market significantly)
 * 20 pts: Alpha >= 0%    (matching or beating market)
 * 15 pts: Alpha >= -5%   (slight underperformance)
 * 10 pts: Alpha >= -10%  (moderate underperformance)
 * 5 pts:  Alpha >= -20%  (significant underperformance)
 * 0 pts:  Alpha < -20%   (severe underperformance)
 */
export function calculateRelativeReturnScore(alpha: number): number {
  if (alpha >= 5) return 25;
  if (alpha >= 0) return 20;
  if (alpha >= -5) return 15;
  if (alpha >= -10) return 10;
  if (alpha >= -20) return 5;
  return 0;
}

/**
 * Score based on days spent below cost basis
 *
 * 20 pts: < 30 days underwater (or never)
 * 15 pts: < 180 days (6 months)
 * 10 pts: < 365 days (1 year)
 * 5 pts:  < 730 days (2 years)
 * 0 pts:  >= 730 days (2+ years underwater)
 */
export function calculateUnderwaterScore(daysUnderwater: number): number {
  if (daysUnderwater < 30) return 20;
  if (daysUnderwater < 180) return 15;
  if (daysUnderwater < 365) return 10;
  if (daysUnderwater < 730) return 5;
  return 0;
}

/**
 * Score based on Sharpe Ratio (risk-adjusted return)
 * Sharpe = (Return - Risk Free Rate) / Volatility
 *
 * 15 pts: Sharpe >= 1.0   (excellent risk-adjusted return)
 * 12 pts: Sharpe >= 0.5   (good)
 * 8 pts:  Sharpe >= 0     (acceptable)
 * 4 pts:  Sharpe >= -0.5  (poor)
 * 0 pts:  Sharpe < -0.5   (very poor - high risk, negative return)
 */
export function calculateRiskScore(sharpeRatio: number): number {
  if (sharpeRatio >= 1.0) return 15;
  if (sharpeRatio >= 0.5) return 12;
  if (sharpeRatio >= 0) return 8;
  if (sharpeRatio >= -0.5) return 4;
  return 0;
}

/**
 * Score based on dividend health
 * For non-dividend stocks, these points are redistributed to other categories
 *
 * 15 pts: Growing dividends (>3% annual growth)
 * 12 pts: Stable dividends (flat, -3% to +3%)
 * 6 pts:  Declining dividends (<-3% growth)
 * 0 pts:  Suspended or cut dividends
 */
export function calculateDividendScore(trend: DividendTrend, growth: number): number | null {
  if (trend === 'none') return null; // Redistribute points
  if (trend === 'suspended') return 0;
  if (trend === 'growing' && growth >= 3) return 15;
  if (trend === 'flat' || (growth >= -3 && growth < 3)) return 12;
  if (trend === 'declining') return 6;
  return 0;
}

/**
 * Calculate final health score for a holding
 *
 * @param metrics - All calculated metrics for the holding
 * @param weights - Scoring weights from configuration
 * @returns Final health score (0-100)
 */
export function calculateHealthScore(metrics: HealthMetrics, weights: HealthCheckConfig['weights']): number {
  const absoluteScore = calculateAbsoluteReturnScore(metrics.xirr);
  const relativeScore = calculateRelativeReturnScore(metrics.alpha3Y);
  const underwaterScore = calculateUnderwaterScore(metrics.daysUnderwater);
  const riskScore = calculateRiskScore(metrics.sharpeRatio);
  const dividendScore = calculateDividendScore(metrics.dividendTrend, metrics.dividendGrowth3Y);

  let score: number;

  // If non-dividend stock, redistribute dividend weight proportionally
  if (dividendScore === null) {
    const totalOtherWeights = weights.absoluteReturn + weights.relativeReturn + weights.underwater + weights.volatility;

    const multiplier = 100 / totalOtherWeights;

    score = Math.round(
      absoluteScore * (weights.absoluteReturn / 25) * multiplier +
        relativeScore * (weights.relativeReturn / 25) * multiplier +
        underwaterScore * (weights.underwater / 20) * multiplier +
        riskScore * (weights.volatility / 15) * multiplier,
    );
  } else {
    score = Math.round(
      absoluteScore * (weights.absoluteReturn / 25) +
        relativeScore * (weights.relativeReturn / 25) +
        underwaterScore * (weights.underwater / 20) +
        riskScore * (weights.volatility / 15) +
        dividendScore * (weights.dividends / 15),
    );
  }

  // Apply penalty for small positions (less than 1% of portfolio)
  // Reduce score by 10 points to encourage consolidation
  if (metrics.portfolioWeight < 0.01) {
    score = Math.max(15, score - 10); // Minimum score of 15
  }

  // Apply penalty for large positions (more than 15% of portfolio)
  // Reduce score by 10 points to discourage concentration risk
  if (metrics.portfolioWeight > 0.15) {
    score = Math.max(15, score - 10); // Minimum score of 15
  }

  return score;
}

/**
 * Convert score to severity level for UI styling
 *
 * @param score - Health score (0-100)
 * @returns Severity level
 */
export function scoreToSeverity(score: number): Severity {
  if (score <= 30) return 'critical'; // Red - urgent attention needed
  if (score <= 50) return 'warning'; // Orange - should review
  if (score <= 70) return 'info'; // Yellow - monitor
  return 'healthy'; // Green - no action needed
}

/**
 * Generate recommendation based on score and flags
 *
 * @param score - Health score (0-100)
 * @param flags - Array of health flags
 * @param metrics - All calculated metrics
 * @returns Recommendation action
 */
export function generateRecommendation(
  score: number,
  flags: HealthFlag[],
  metrics: HealthMetrics,
): HealthRecommendation {
  // Critical issues warrant SELL recommendation
  if (score <= 25) return 'SELL';

  // Multiple serious flags suggest selling
  const seriousFlags: HealthFlag[] = [
    'NEGATIVE_RETURN_3Y',
    'EXTENDED_UNDERWATER',
    'DECLINING_DIVIDENDS',
    'HIGH_OPPORTUNITY_COST',
  ];
  const seriousFlagCount = flags.filter((f) => seriousFlags.includes(f)).length;
  if (seriousFlagCount >= 3) return 'SELL';

  // Moderate issues warrant review
  if (score <= 50) return 'REVIEW';
  if (seriousFlagCount >= 2) return 'REVIEW';

  // Strong performers might be worth accumulating
  if (score >= 85 && metrics.alpha3Y > 5) return 'ACCUMULATE';

  return 'HOLD';
}
