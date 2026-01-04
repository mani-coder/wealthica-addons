/**
 * Portfolio Health Check Type Definitions
 *
 * This file contains all type definitions for the Portfolio Health Check feature,
 * which identifies underperforming holdings and suggests candidates for review/selling.
 */

import type { Position } from '@/types';

export type HealthRecommendation = 'SELL' | 'REVIEW' | 'HOLD' | 'ACCUMULATE';

export type Severity = 'critical' | 'warning' | 'info' | 'healthy';

export type DividendTrend = 'growing' | 'flat' | 'declining' | 'suspended' | 'none';

export type HealthFlag =
  | 'NEGATIVE_RETURN_1Y'
  | 'NEGATIVE_RETURN_3Y' // Lost money over 3 years
  | 'NEGATIVE_RETURN_5Y' // Lost money over 5 years
  | 'NEGATIVE_RETURN_SINCE_INCEPTION' // Lost money since inception
  | 'UNDERPERFORMED_BENCHMARK_1Y' // Lagged S&P 500 / TSX significantly
  | 'UNDERPERFORMED_BENCHMARK_3Y' // Lagged S&P 500 / TSX significantly
  | 'UNDERPERFORMED_BENCHMARK_5Y' // Lagged S&P 500 / TSX significantly
  | 'UNDERPERFORMED_BENCHMARK_SINCE_INCEPTION' // Lagged S&P 500 / TSX significantly
  | 'HIGH_OPPORTUNITY_COST' // Would have made $X more in index fund
  | 'EXTENDED_UNDERWATER' // Below cost basis for > 1 year
  | 'DECLINING_DIVIDENDS' // Dividend cuts or suspensions
  | 'HIGH_VOLATILITY' // High risk without commensurate return
  | 'DEATH_CROSS' // 50-day MA crossed below 200-day MA
  | 'CONSECUTIVE_DECLINE' // Multiple quarters of decline
  | 'SMALL_POSITION' // Position too small to matter (<1% portfolio)
  | 'LARGE_POSITION'; // Position concentration risk (>15% portfolio)

export type StrengthFlag =
  | 'POSITIVE_RETURN_3Y' // Made money over 3 years
  | 'OUTPERFORMED_BENCHMARK' // Beat benchmark significantly
  | 'LOW_VOLATILITY' // Stable, low-risk investment
  | 'POSITIVE_SHARPE' // Good risk-adjusted returns
  | 'GROWING_DIVIDENDS' // Increasing dividend payments
  | 'STRONG_MOMENTUM' // Recent positive performance
  | 'LONG_TERM_HOLD'; // Held for extended period with positive returns

/**
 * Comprehensive health metrics for a single holding
 */
export interface HealthMetrics {
  // Return metrics
  return1Y: number; // 1-year return %
  return3Y: number; // 3-year return %
  return5Y: number; // 5-year return %
  returnSinceInception: number; // Return since first purchase %
  xirr: number; // Extended Internal Rate of Return (annualized) %

  // Benchmark comparison
  benchmarkReturn1Y: number; // Benchmark return over same period %
  benchmarkReturn3Y: number; // Benchmark return over same period %
  benchmarkReturn5Y: number; // Benchmark return over same period %
  benchmarkReturnSinceInception: number; // Benchmark return since inception %

  alpha1Y: number; // return1Y - benchmarkReturn1Y
  alpha3Y: number; // return3Y - benchmarkReturn3Y
  alpha5Y: number; // return5Y - benchmarkReturn5Y
  alphaSinceInception: number; // returnSinceInception - benchmarkReturnSinceInception

  // Opportunity cost
  opportunityCost: number; // $ amount lost vs investing in benchmark

  // Drawdown metrics
  maxDrawdown: number; // Worst peak-to-trough decline %
  currentDrawdown: number; // Current decline from peak %

  // Underwater analysis
  daysUnderwater: number; // Days below cost basis (since first purchase)
  holdingPeriodDays: number; // Days since first purchase

  // Risk metrics
  volatility: number; // Annualized standard deviation
  sharpeRatio: number; // Risk-adjusted return

  // Dividend metrics (for dividend-paying stocks)
  dividendYield: number; // Current yield %
  dividendGrowth3Y: number; // 3-year dividend growth rate %
  dividendTrend: DividendTrend;

  // Position info
  portfolioWeight: number; // % of total portfolio
  positionSize: number; // $ market value
  costBasis: number; // $ total cost basis
}

/**
 * Health report for a single holding
 */
export interface HoldingHealthReport {
  // Identification
  symbol: string;
  name: string;
  position: Position;

  // Scores
  score: number; // 0-100, lower = worse health
  recommendation: HealthRecommendation;
  severity: Severity;

  // Issues identified
  flags: HealthFlag[];
  flagDescriptions: string[]; // Human-readable explanations

  // Strengths identified
  strengths: StrengthFlag[];
  strengthDescriptions: string[]; // Human-readable explanations

  // All metrics
  metrics: HealthMetrics;

  // Actionable insights
  opportunityCostDescription: string; // "If invested in S&P 500, you'd have $X more"
  suggestedAction: string; // Specific actionable advice
}

/**
 * Summary of the entire portfolio health check
 */
export interface PortfolioHealthSummary {
  // Overall scores
  overallScore: number; // Weighted average of all holdings
  totalOpportunityCost: number; // Sum of all opportunity costs

  // Counts
  holdingsReviewed: number;
  flaggedHoldings: number;
  criticalCount: number;
  warningCount: number;
  healthyCount: number;

  // Individual reports
  reports: HoldingHealthReport[];

  // Sorted lists for quick access
  worstPerformers: HoldingHealthReport[]; // Top 5 lowest scores
  biggestDrags: HoldingHealthReport[]; // Top 5 highest opportunity cost

  // Portfolio-level recommendations
  recommendations: string[];

  // Metadata
  analysisDate: Date;
  benchmarkUsed: string;
  analysisPeriodYears: number;
}

/**
 * Configuration for health check analysis
 */
export interface HealthCheckConfig {
  // Benchmark settings
  benchmarkSymbol: string; // Default: 'SPY' or '^GSPTSE' for Canadian
  analysisPeriodYears: number; // Default: 3

  // Scoring weights (must sum to 100)
  weights: {
    absoluteReturn: number; // Default: 25
    relativeReturn: number; // Default: 25
    underwater: number; // Default: 20
    volatility: number; // Default: 15
    dividends: number; // Default: 15
  };

  // Thresholds for triggering flags
  thresholds: {
    negativeReturnYears: number; // Default: 3 - flag if negative for X years
    benchmarkUnderperformance: number; // Default: -15 - flag if alpha < X%
    benchmarkOutperformance: number; // Default: 5 - strength if alpha > X%
    underwaterDays: number; // Default: 365 - flag if underwater > X days
    opportunityCostMin: number; // Default: 500 - min $ to flag
    smallPositionThreshold: number; // Default: 0.01 - ignore if < 1% of portfolio
    largePositionThreshold: number; // Default: 0.15 - flag if > 15% of portfolio
    volatilityMax: number; // Default: 0.4 - flag if annualized vol > 40%
    volatilityLow: number; // Default: 0.15 - strength if vol < 15%
    sharpeGood: number; // Default: 1.0 - strength if Sharpe > 1.0
  };

  // Exclusions
  excludedSymbols: string[]; // Symbols to skip in analysis
}

/**
 * Default configuration
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  benchmarkSymbol: 'SPY',
  analysisPeriodYears: 3,
  weights: {
    absoluteReturn: 25,
    relativeReturn: 25,
    underwater: 20,
    volatility: 15,
    dividends: 15,
  },
  thresholds: {
    negativeReturnYears: 3,
    benchmarkUnderperformance: -15,
    benchmarkOutperformance: 5,
    underwaterDays: 365,
    opportunityCostMin: 500,
    smallPositionThreshold: 0.01,
    largePositionThreshold: 0.15,
    volatilityMax: 0.4,
    volatilityLow: 0.15,
    sharpeGood: 1.0,
  },
  excludedSymbols: [],
};

/**
 * Consistent colors for severity levels
 */
export const SEVERITY_COLORS = {
  critical: '#EF4444', // Red-500
  warning: '#F97316', // Orange-500
  info: '#EAB308', // Yellow-500
  healthy: '#22C55E', // Green-500
};

export const RECOMMENDATION_COLORS = {
  SELL: 'bg-red-50 border border-red-200 text-red-700', // Red-500
  REVIEW: 'bg-orange-50 border border-orange-200 text-orange-700', // Orange-500
  ACCUMULATE: 'bg-emerald-50 border border-emerald-200 text-emerald-700',
  HOLD: 'bg-blue-50 border border-blue-200 text-blue-700',
};

/**
 * Color gradient for score visualization
 */
export const SCORE_GRADIENT = [
  { stop: 0, color: '#EF4444' }, // 0-30: Red
  { stop: 30, color: '#F97316' }, // 30-50: Orange
  { stop: 50, color: '#EAB308' }, // 50-70: Yellow
  { stop: 70, color: '#22C55E' }, // 70-100: Green
];
