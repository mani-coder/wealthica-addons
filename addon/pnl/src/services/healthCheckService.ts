/**
 * Health Check Service
 *
 * This service analyzes portfolio holdings to identify underperformers
 * and provides actionable recommendations.
 */

import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { DATE_FORMAT } from '@/constants';
import type { Currencies } from '../context/CurrencyContext';
import type { Position, Transaction } from '../types';
import {
  DEFAULT_HEALTH_CHECK_CONFIG,
  type DividendTrend,
  type HealthCheckConfig,
  type HealthFlag,
  type HealthMetrics,
  type HoldingHealthReport,
  type PortfolioHealthSummary,
} from '../types/healthCheck';
import { formatMoney, isTradingDay } from '../utils/common';
import { calculateHealthScore, generateRecommendation, scoreToSeverity } from '../utils/healthScoring';
import { calculateOpenTransactions, type OpenTransaction } from '../utils/transactionUtils';

/**
 * Price point in historical data
 */
export interface PricePoint {
  date: Date | Dayjs;
  close: number;
}

/**
 * Historical price data for a symbol
 */
export type PriceHistory = {
  symbol: string;
  prices: PricePoint[];
};

/**
 * Main service class for portfolio health analysis
 */
export class HealthCheckService {
  private config: HealthCheckConfig;
  private currencies?: Currencies;

  constructor(config: Partial<HealthCheckConfig> = {}, currencies?: Currencies) {
    this.config = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };
    this.currencies = currencies;
  }

  /**
   * Run full health check on entire portfolio
   */
  async analyzePortfolio(
    positions: Position[],
    transactions: Transaction[],
    priceHistories: Map<string, PriceHistory>,
    benchmarkHistory: PriceHistory,
  ): Promise<PortfolioHealthSummary> {
    const totalPortfolioValue = positions.reduce((sum, p) => sum + p.market_value, 0);
    const reports: HoldingHealthReport[] = [];

    for (const position of positions) {
      // Skip small positions
      const weight = position.market_value / totalPortfolioValue;
      if (weight < this.config.thresholds.smallPositionThreshold) {
        continue;
      }

      // Skip excluded symbols
      if (this.config.excludedSymbols.includes(position.security.symbol)) {
        continue;
      }

      const positionTransactions = transactions.filter((t) => t.symbol === position.security.symbol);
      const openTransactions = calculateOpenTransactions(positionTransactions, this.currencies);
      const priceHistory = priceHistories.get(position.security.symbol);

      if (priceHistory && priceHistory.prices.length > 0) {
        const report = await this.analyzeHolding(
          position,
          positionTransactions,
          openTransactions,
          priceHistory,
          benchmarkHistory,
          totalPortfolioValue,
        );
        reports.push(report);
      }
    }

    // Sort by score (worst first)
    reports.sort((a, b) => a.score - b.score);

    // Calculate summary metrics
    const flaggedHoldings = reports.filter((r) => r.flags.length > 0).length;
    const criticalCount = reports.filter((r) => r.severity === 'critical').length;
    const warningCount = reports.filter((r) => r.severity === 'warning').length;
    const healthyCount = reports.filter((r) => r.severity === 'healthy').length;

    // Calculate weighted average score
    const overallScore = this.calculateWeightedAverageScore(reports);

    // Sum opportunity costs
    const totalOpportunityCost = reports.reduce((sum, r) => sum + r.metrics.opportunityCost, 0);

    // Get worst performers and biggest drags
    const worstPerformers = [...reports].slice(0, 5);
    const biggestDrags = [...reports].sort((a, b) => b.metrics.opportunityCost - a.metrics.opportunityCost).slice(0, 5);

    // Generate portfolio-level recommendations
    const recommendations = this.generatePortfolioRecommendations(reports);

    return {
      overallScore,
      totalOpportunityCost,
      holdingsReviewed: reports.length,
      flaggedHoldings,
      criticalCount,
      warningCount,
      healthyCount,
      reports,
      worstPerformers,
      biggestDrags,
      recommendations,
      analysisDate: new Date(),
      benchmarkUsed: this.config.benchmarkSymbol,
      analysisPeriodYears: this.config.analysisPeriodYears,
    };
  }

  /**
   * Analyze a single holding
   */
  analyzeHolding(
    position: Position,
    transactions: Transaction[],
    openTransactions: OpenTransaction[],
    priceHistory: PriceHistory,
    benchmarkHistory: PriceHistory,
    totalPortfolioValue: number,
  ): HoldingHealthReport {
    // Calculate all metrics
    const metrics = this.calculateMetrics(
      position,
      transactions,
      openTransactions,
      priceHistory,
      benchmarkHistory,
      totalPortfolioValue,
    );

    // Calculate score
    const score = calculateHealthScore(metrics, this.config.weights);

    // Determine flags and strengths
    const flags = this.determineFlags(metrics);
    const flagDescriptions = this.generateFlagDescriptions(flags, metrics);
    const strengths = this.determineStrengths(metrics);
    const strengthDescriptions = this.generateStrengthDescriptions(strengths, metrics);

    // Generate recommendation
    const recommendation = generateRecommendation(score, flags, metrics);
    const severity = scoreToSeverity(score);

    // Generate insights
    const opportunityCostDescription = this.formatOpportunityCost(metrics.opportunityCost, this.config.benchmarkSymbol);
    const suggestedAction = this.generateSuggestedAction(recommendation, flags);

    return {
      position,
      symbol: position.security.symbol,
      name: position.security.name,
      score,
      recommendation,
      severity,
      flags,
      flagDescriptions,
      strengths,
      strengthDescriptions,
      metrics,
      opportunityCostDescription,
      suggestedAction,
    };
  }

  /**
   * Calculate all health metrics for a holding
   */
  private calculateMetrics(
    position: Position,
    transactions: Transaction[],
    openTransactions: OpenTransaction[],
    priceHistory: PriceHistory,
    benchmarkHistory: PriceHistory,
    totalPortfolioValue: number,
  ): HealthMetrics {
    const oneYearAgo = dayjs().subtract(1, 'year').startOf('day');
    const threeYearsAgo = dayjs().subtract(3, 'years').startOf('day');
    const fiveYearsAgo = dayjs().subtract(5, 'years').startOf('day');

    // Dividend metrics
    const dividendYield = this.calculateDividendYield(transactions, position);
    const dividendGrowth3Y = this.calculateDividendGrowth(transactions);
    const dividendTrend = this.determineDividendTrend(transactions);

    const holdingStartDate = openTransactions[0].date;

    // Calculate total returns (price appreciation + dividends)
    const return1Y = this.calculatePriceReturn(priceHistory, oneYearAgo, holdingStartDate, dividendYield);
    const return3Y = this.calculatePriceReturn(priceHistory, threeYearsAgo, holdingStartDate, dividendYield * 3);
    const return5Y = this.calculatePriceReturn(priceHistory, fiveYearsAgo, holdingStartDate, dividendYield * 5);
    const returnSinceInception =
      (position.gain_percent || 0) * 100 + (dividendYield * dayjs().diff(holdingStartDate, 'days')) / 365;

    const xirr = this.calculateXIRR(position);

    // Benchmark comparison (benchmarks don't have dividend transactions, so use price-only returns)
    const benchmarkReturn1Y = this.calculatePriceReturn(benchmarkHistory, oneYearAgo, holdingStartDate);
    const benchmarkReturn3Y = this.calculatePriceReturn(benchmarkHistory, threeYearsAgo, holdingStartDate);
    const benchmarkReturn5Y = this.calculatePriceReturn(benchmarkHistory, fiveYearsAgo, holdingStartDate);
    const benchmarkReturnSinceInception = this.calculatePriceReturn(
      benchmarkHistory,
      holdingStartDate,
      holdingStartDate,
    );

    const alpha1Y = return1Y - benchmarkReturn1Y;
    const alpha3Y = return3Y - benchmarkReturn3Y;
    const alpha5Y = return5Y - benchmarkReturn5Y;
    const alphaSinceInception = returnSinceInception - benchmarkReturnSinceInception;

    // Opportunity cost
    const opportunityCost = this.calculateOpportunityCost(openTransactions, position, benchmarkHistory);

    // Drawdowns
    const maxDrawdown = this.calculateMaxDrawdown(priceHistory);
    const currentDrawdown = this.calculateCurrentDrawdown(priceHistory);

    // Underwater analysis
    const daysUnderwater = this.calculateDaysUnderwater(openTransactions, priceHistory);
    const holdingPeriodDays = this.calculateHoldingPeriodDays(openTransactions);

    // Risk metrics
    const volatility = this.calculateVolatility(priceHistory);
    const sharpeRatio = this.calculateSharpeRatio(priceHistory);

    return {
      // Return metrics
      return1Y,
      return3Y,
      return5Y,
      returnSinceInception,
      xirr,

      // Benchmark metrics
      benchmarkReturn1Y,
      benchmarkReturn3Y,
      benchmarkReturn5Y,
      benchmarkReturnSinceInception,

      // Alpha metrics
      alpha1Y,
      alpha3Y,
      alpha5Y,
      alphaSinceInception,

      opportunityCost,
      maxDrawdown,
      currentDrawdown,
      daysUnderwater,
      holdingPeriodDays,
      volatility,
      sharpeRatio,
      dividendYield,
      dividendGrowth3Y,
      dividendTrend,
      portfolioWeight: position.market_value / totalPortfolioValue,
      positionSize: position.market_value, // Use market_value directly from position
      costBasis: position.book_value, // Use book_value directly from position
    };
  }

  /**
   * Determine which flags apply based on metrics and thresholds
   */
  private determineFlags(metrics: HealthMetrics): HealthFlag[] {
    const flags: HealthFlag[] = [];
    const { thresholds } = this.config;

    // Negative returns across different time periods
    if (metrics.return1Y < 0) {
      flags.push('NEGATIVE_RETURN_1Y');
    }

    if (metrics.return3Y < 0) {
      flags.push('NEGATIVE_RETURN_3Y');
    }

    if (metrics.return5Y < 0) {
      flags.push('NEGATIVE_RETURN_5Y');
    }

    if (metrics.returnSinceInception < 0) {
      flags.push('NEGATIVE_RETURN_SINCE_INCEPTION');
    }

    // Benchmark underperformance
    if (metrics.alpha1Y < thresholds.benchmarkUnderperformance) {
      flags.push('UNDERPERFORMED_BENCHMARK_1Y');
    }

    if (metrics.alpha3Y < thresholds.benchmarkUnderperformance) {
      flags.push('UNDERPERFORMED_BENCHMARK_3Y');
    }

    if (metrics.alpha5Y < thresholds.benchmarkUnderperformance) {
      flags.push('UNDERPERFORMED_BENCHMARK_5Y');
    }

    if (metrics.alphaSinceInception < thresholds.benchmarkUnderperformance) {
      flags.push('UNDERPERFORMED_BENCHMARK_SINCE_INCEPTION');
    }

    // Opportunity cost
    if (metrics.opportunityCost > thresholds.opportunityCostMin) {
      flags.push('HIGH_OPPORTUNITY_COST');
    }

    // Underwater position
    if (metrics.daysUnderwater > thresholds.underwaterDays) {
      flags.push('EXTENDED_UNDERWATER');
    }

    // Dividend issues
    if (metrics.dividendTrend === 'declining' || metrics.dividendTrend === 'suspended') {
      flags.push('DECLINING_DIVIDENDS');
    }

    // Volatility and risk
    if (metrics.volatility > thresholds.volatilityMax && metrics.sharpeRatio < 0.5) {
      flags.push('HIGH_VOLATILITY');
    }

    // Position sizing
    if (metrics.portfolioWeight < thresholds.smallPositionThreshold) {
      flags.push('SMALL_POSITION');
    }

    if (metrics.portfolioWeight > thresholds.largePositionThreshold) {
      flags.push('LARGE_POSITION');
    }

    return flags;
  }

  /**
   * Determine which strengths apply based on metrics and thresholds
   */
  private determineStrengths(metrics: HealthMetrics): import('../types/healthCheck').StrengthFlag[] {
    const strengths: import('../types/healthCheck').StrengthFlag[] = [];
    const { thresholds } = this.config;

    if (metrics.return3Y > 0) {
      strengths.push('POSITIVE_RETURN_3Y');
    }

    if (metrics.alpha3Y > thresholds.benchmarkOutperformance) {
      strengths.push('OUTPERFORMED_BENCHMARK');
    }

    if (metrics.volatility < thresholds.volatilityLow) {
      strengths.push('LOW_VOLATILITY');
    }

    if (metrics.sharpeRatio > thresholds.sharpeGood) {
      strengths.push('POSITIVE_SHARPE');
    }

    if (metrics.dividendTrend === 'growing') {
      strengths.push('GROWING_DIVIDENDS');
    }

    if (metrics.return1Y > 10) {
      strengths.push('STRONG_MOMENTUM');
    }

    if (metrics.holdingPeriodDays > 730 && metrics.return3Y > 0) {
      // Held for 2+ years with positive returns
      strengths.push('LONG_TERM_HOLD');
    }

    return strengths;
  }

  /**
   * Generate human-readable descriptions for each strength
   */
  private generateStrengthDescriptions(
    strengths: import('../types/healthCheck').StrengthFlag[],
    metrics: HealthMetrics,
  ): string[] {
    const descriptions: string[] = [];

    for (const strength of strengths) {
      switch (strength) {
        case 'POSITIVE_RETURN_3Y':
          descriptions.push(`Positive 3-year return of ${metrics.return3Y.toFixed(1)}%`);
          break;
        case 'OUTPERFORMED_BENCHMARK':
          descriptions.push(`Outperformed ${this.config.benchmarkSymbol} by ${metrics.alpha3Y.toFixed(1)}%`);
          break;
        case 'LOW_VOLATILITY':
          descriptions.push(`Low volatility (${(metrics.volatility * 100).toFixed(0)}%) - stable investment`);
          break;
        case 'POSITIVE_SHARPE':
          descriptions.push(`Excellent risk-adjusted returns (Sharpe ratio: ${metrics.sharpeRatio.toFixed(2)})`);
          break;
        case 'GROWING_DIVIDENDS':
          descriptions.push(`Growing dividends (${metrics.dividendGrowth3Y.toFixed(1)}% annual growth)`);
          break;
        case 'STRONG_MOMENTUM':
          descriptions.push(`Strong recent performance (${metrics.return1Y.toFixed(1)}% in last year)`);
          break;
        case 'LONG_TERM_HOLD':
          descriptions.push(
            `Long-term hold (${Math.floor(metrics.holdingPeriodDays / 365)} years) with positive returns`,
          );
          break;
      }
    }

    return descriptions;
  }

  /**
   * Generate human-readable descriptions for each flag
   */
  private generateFlagDescriptions(flags: HealthFlag[], metrics: HealthMetrics): string[] {
    const descriptions: string[] = [];

    for (const flag of flags) {
      switch (flag) {
        case 'NEGATIVE_RETURN_1Y':
          descriptions.push(`Negative 1-year return of ${metrics.return1Y.toFixed(1)}%`);
          break;
        case 'NEGATIVE_RETURN_3Y':
          descriptions.push(`Negative 3-year return of ${metrics.return3Y.toFixed(1)}%`);
          break;
        case 'NEGATIVE_RETURN_5Y':
          descriptions.push(`Negative 5-year return of ${metrics.return5Y.toFixed(1)}%`);
          break;
        case 'NEGATIVE_RETURN_SINCE_INCEPTION':
          descriptions.push(`Negative since holding started return of ${metrics.returnSinceInception.toFixed(1)}%`);
          break;
        case 'UNDERPERFORMED_BENCHMARK_1Y':
          descriptions.push(
            `Underperformed ${this.config.benchmarkSymbol} by ${Math.abs(metrics.alpha1Y).toFixed(1)}% in last year`,
          );
          break;
        case 'UNDERPERFORMED_BENCHMARK_3Y':
          descriptions.push(
            `Underperformed ${this.config.benchmarkSymbol} by ${Math.abs(metrics.alpha3Y).toFixed(1)}% in last 3 years`,
          );
          break;
        case 'UNDERPERFORMED_BENCHMARK_5Y':
          descriptions.push(
            `Underperformed ${this.config.benchmarkSymbol} by ${Math.abs(metrics.alpha5Y).toFixed(1)}% in last 5 years`,
          );
          break;
        case 'UNDERPERFORMED_BENCHMARK_SINCE_INCEPTION':
          descriptions.push(
            `Underperformed ${this.config.benchmarkSymbol} by ${Math.abs(metrics.alphaSinceInception).toFixed(1)}% since holding start`,
          );
          break;
        case 'HIGH_OPPORTUNITY_COST':
          descriptions.push(`Opportunity cost of $${formatMoney(metrics.opportunityCost)}`);
          break;
        case 'EXTENDED_UNDERWATER': {
          const holdingPeriodMonths = Math.floor(metrics.holdingPeriodDays / 30);
          const underwaterPercent =
            metrics.holdingPeriodDays > 0 ? Math.round((metrics.daysUnderwater / metrics.holdingPeriodDays) * 100) : 0;
          descriptions.push(
            `Below cost basis for ${metrics.daysUnderwater} days (${underwaterPercent}% of your ${holdingPeriodMonths}-month holding period)`,
          );
          break;
        }
        case 'DECLINING_DIVIDENDS':
          descriptions.push('Dividend has been cut or is declining');
          break;
        case 'HIGH_VOLATILITY':
          descriptions.push(
            `High volatility (${(metrics.volatility * 100).toFixed(0)}%) with poor risk-adjusted returns`,
          );
          break;
        case 'SMALL_POSITION':
          descriptions.push(`Small position (${(metrics.portfolioWeight * 100).toFixed(2)}% of portfolio)`);
          break;
        case 'LARGE_POSITION':
          descriptions.push(
            `Large position (${(metrics.portfolioWeight * 100).toFixed(1)}% of portfolio) - concentration risk`,
          );
          break;
      }
    }

    return descriptions;
  }

  /**
   * Format opportunity cost as readable string
   */
  private formatOpportunityCost(cost: number, benchmark: string): string {
    if (cost <= 0) {
      return `Outperformed ${benchmark} - no opportunity cost`;
    }
    return `If invested in ${benchmark} instead, you would have $${formatMoney(cost)} more today`;
  }

  /**
   * Generate specific action suggestion based on analysis
   */
  private generateSuggestedAction(recommendation: string, flags: HealthFlag[]): string {
    // Helper to check for multiple related flags
    const hasNegativeReturns = flags.some((f) =>
      ['NEGATIVE_RETURN_1Y', 'NEGATIVE_RETURN_3Y', 'NEGATIVE_RETURN_5Y', 'NEGATIVE_RETURN_SINCE_INCEPTION'].includes(f),
    );
    const hasLongTermNegativeReturns = flags.some((f) =>
      ['NEGATIVE_RETURN_3Y', 'NEGATIVE_RETURN_5Y', 'NEGATIVE_RETURN_SINCE_INCEPTION'].includes(f),
    );
    const hasUnderperformance = flags.some((f) =>
      [
        'UNDERPERFORMED_BENCHMARK_1Y',
        'UNDERPERFORMED_BENCHMARK_3Y',
        'UNDERPERFORMED_BENCHMARK_5Y',
        'UNDERPERFORMED_BENCHMARK_SINCE_INCEPTION',
      ].includes(f),
    );
    const hasLongTermUnderperformance = flags.some((f) =>
      [
        'UNDERPERFORMED_BENCHMARK_3Y',
        'UNDERPERFORMED_BENCHMARK_5Y',
        'UNDERPERFORMED_BENCHMARK_SINCE_INCEPTION',
      ].includes(f),
    );

    switch (recommendation) {
      case 'SELL':
        // Tax loss harvesting opportunity
        if (hasLongTermNegativeReturns && flags.includes('EXTENDED_UNDERWATER')) {
          return 'Consider selling to harvest tax losses and reallocate to better performers. The position has been underwater for an extended period.';
        }

        // Significant opportunity cost
        if (flags.includes('HIGH_OPPORTUNITY_COST') && hasLongTermUnderperformance) {
          return 'Sell and invest proceeds in a broad index fund. You would have significantly more capital had you chosen the benchmark.';
        }

        // Dividend stock that's failing
        if (flags.includes('DECLINING_DIVIDENDS') && hasNegativeReturns) {
          return 'Exit the position. Dividend cuts combined with negative returns suggest fundamental deterioration.';
        }

        // High volatility with poor returns
        if (flags.includes('HIGH_VOLATILITY') && hasNegativeReturns) {
          return 'Sell to reduce portfolio risk. High volatility without positive returns is not a good risk/reward trade-off.';
        }

        // Extended underwater period
        if (flags.includes('EXTENDED_UNDERWATER') && flags.includes('NEGATIVE_RETURN_SINCE_INCEPTION')) {
          return 'Consider exiting. The position has consistently failed to recover and deliver returns.';
        }

        // General sell recommendation with multiple issues
        if (flags.length >= 4) {
          return 'This holding has multiple critical issues. Strongly consider exiting the position and reallocating to quality investments.';
        }

        return 'This holding has significant red flags. Consider exiting the position.';

      case 'REVIEW':
        // Position sizing issues
        if (flags.includes('LARGE_POSITION')) {
          if (hasUnderperformance) {
            return 'Reduce position size to manage concentration risk. This large position is underperforming and exposes your portfolio to unnecessary risk.';
          }
          return 'Consider trimming to reduce concentration risk. No single position should dominate your portfolio.';
        }

        if (flags.includes('SMALL_POSITION')) {
          if (hasUnderperformance) {
            return 'Exit this small underperformer. It adds complexity without meaningful portfolio impact.';
          }
          return 'Consider consolidating into larger positions or selling. Small positions add complexity without meaningful portfolio impact.';
        }

        // Dividend concerns
        if (flags.includes('DECLINING_DIVIDENDS')) {
          if (!hasNegativeReturns) {
            return 'Review company fundamentals immediately. Dividend cuts often precede deeper issues, but the stock price may not reflect this yet.';
          }
          return 'Deep dive into company financials. Dividend cuts combined with price weakness suggest serious business challenges.';
        }

        // Volatility concerns
        if (flags.includes('HIGH_VOLATILITY')) {
          return 'Evaluate if the volatility matches your risk tolerance. Consider reducing position size or adding stop-losses.';
        }

        // Underperformance without losses
        if (hasLongTermUnderperformance && !hasNegativeReturns) {
          return 'Reevaluate your investment thesis. While not losing money, you are missing out on better returns available in the market.';
        }

        // Extended underwater but recovering
        if (flags.includes('EXTENDED_UNDERWATER') && !flags.includes('NEGATIVE_RETURN_1Y')) {
          return 'Monitor closely. While showing recent improvement, the position has been underwater for an extended period.';
        }

        // Short-term underperformance
        if (flags.includes('UNDERPERFORMED_BENCHMARK_1Y') && !hasLongTermUnderperformance) {
          return 'Watch this position. Recent underperformance may be temporary, but set a timeframe to reassess.';
        }

        // Recent negative returns
        if (flags.includes('NEGATIVE_RETURN_1Y') && !hasLongTermNegativeReturns) {
          return 'Review your thesis. Recent weakness may be a buying opportunity or the start of a longer decline.';
        }

        // Opportunity cost without other major issues
        if (flags.includes('HIGH_OPPORTUNITY_COST') && flags.length === 1) {
          return 'Consider if your conviction justifies the opportunity cost. Passive index investing might be a better choice.';
        }

        // General review recommendation
        return 'This holding deserves closer attention. Review your original investment thesis and whether it still holds.';

      case 'ACCUMULATE':
        // Strong performer but concentrated
        if (flags.includes('LARGE_POSITION')) {
          return 'Excellent performer, but already a large position. Consider rebalancing to maintain diversification.';
        }

        // Strong performer - standard advice
        return 'Strong performer with solid fundamentals. Consider adding to this position on market dips.';

      case 'HOLD':
        // Large position that's performing okay
        if (flags.includes('LARGE_POSITION')) {
          return 'Maintain current position but avoid adding more to limit concentration risk.';
        }

        // Small position that's performing okay
        if (flags.includes('SMALL_POSITION')) {
          return 'Position is performing adequately. Consider whether to consolidate or grow it to a more meaningful size.';
        }

        // High volatility but stable returns
        if (flags.includes('HIGH_VOLATILITY')) {
          return 'Monitor volatility and consider hedging strategies if it affects your risk tolerance.';
        }

        // Default hold advice
        return 'Position is performing adequately. Continue to monitor and maintain current allocation.';

      default:
        return 'No immediate action needed. Continue to monitor performance periodically.';
    }
  }

  /**
   * Generate portfolio-level recommendations
   */
  private generatePortfolioRecommendations(reports: HoldingHealthReport[]): string[] {
    const recommendations: string[] = [];

    const criticalCount = reports.filter((r) => r.severity === 'critical').length;
    const totalOpportunityCost = reports.reduce((sum, r) => sum + r.metrics.opportunityCost, 0);

    if (criticalCount > 0) {
      recommendations.push(`You have ${criticalCount} holding(s) requiring urgent attention. Review these first.`);
    }

    if (totalOpportunityCost > 5000) {
      recommendations.push(
        `Total opportunity cost of $${formatMoney(totalOpportunityCost)}. Consider consolidating into index funds.`,
      );
    }

    const underwaterHoldings = reports.filter((r) => r.flags.includes('EXTENDED_UNDERWATER')).length;
    if (underwaterHoldings > 3) {
      recommendations.push(
        `${underwaterHoldings} holdings are underwater for over a year. Review if your theses still hold.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Your portfolio looks healthy! Continue monitoring periodically.');
    }

    return recommendations;
  }

  /**
   * Calculate weighted average score across all holdings
   */
  private calculateWeightedAverageScore(reports: HoldingHealthReport[]): number {
    if (reports.length === 0) return 0;

    const totalWeight = reports.reduce((sum, r) => sum + r.metrics.portfolioWeight, 0);
    const weightedSum = reports.reduce((sum, r) => sum + r.score * r.metrics.portfolioWeight, 0);
    return Math.round(weightedSum / totalWeight);
  }

  // ============================================
  // METRIC CALCULATION HELPERS
  // ============================================

  /**
   * Calculate price-only return (capital appreciation) over a period
   */
  private calculatePriceReturn(
    priceHistory: PriceHistory,
    startDate: Dayjs,
    holdingStartDate?: Dayjs,
    dividendYield?: number,
  ): number {
    if (!priceHistory.prices || priceHistory.prices.length < 2) return 0;
    if (holdingStartDate && dayjs(startDate).isBefore(holdingStartDate, 'day')) return 0;

    const sortedPrices = [...priceHistory.prices].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

    const endPrice = sortedPrices[sortedPrices.length - 1].close;
    const startIndex = sortedPrices.findIndex((p) => dayjs(p.date).isSameOrAfter(startDate, 'day'));
    if (startIndex === -1) return 0;
    const startPrice = sortedPrices[startIndex].close;

    if (!startPrice || startPrice === 0) return 0;

    return ((endPrice - startPrice) / startPrice) * 100 + (dividendYield || 0);
  }

  /**
   * Get XIRR (annualized return) from position data
   * Uses the pre-calculated XIRR from the position which already accounts for timing of cash flows
   */
  private calculateXIRR(position: Position): number {
    // Use XIRR from position if available, which is already annualized
    // Convert from decimal to percentage (e.g., 0.15 -> 15%)
    return position.xirr ? position.xirr * 100 : 0;
  }

  /**
   * Calculate opportunity cost vs benchmark based on OPEN transactions only
   * OpportunityCost = BenchmarkValue - ActualValue
   *
   * This calculates what the investment would be worth if the same amounts
   * were invested in the benchmark on the same dates as the actual buy transactions
   * that are still open (not sold).
   */
  private calculateOpportunityCost(
    openTransactions: OpenTransaction[],
    position: Position,
    benchmarkHistory: PriceHistory,
  ): number {
    if (openTransactions.length === 0) return 0;

    let benchmarkValue = 0;
    const stockValue = position.market_value;

    // Get current benchmark price
    const currentBenchmarkPrice =
      benchmarkHistory.prices.length > 0 ? benchmarkHistory.prices[benchmarkHistory.prices.length - 1].close : 0;

    for (const openTx of openTransactions) {
      // Find benchmark price on transaction date
      const benchmarkPrice = this.getPriceOnDate(benchmarkHistory, openTx.date);

      if (benchmarkPrice > 0) {
        // Amount is already converted to base currency by calculateOpenTransactions
        // Calculate how many benchmark shares could be bought with this amount
        const benchmarkShares = openTx.amount / benchmarkPrice;
        benchmarkValue += benchmarkShares * currentBenchmarkPrice;
      }
    }

    // Opportunity cost only exists when benchmark outperformed
    return Math.max(0, benchmarkValue - stockValue);
  }

  /**
   * Get price on a specific date (or closest available date)
   */
  private getPriceOnDate(priceHistory: PriceHistory, date: Dayjs): number {
    const sortedPrices = [...priceHistory.prices].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

    // Find the closest price on or before the date
    for (let i = sortedPrices.length - 1; i >= 0; i--) {
      if (dayjs(sortedPrices[i].date).isSameOrBefore(date, 'day')) {
        return sortedPrices[i].close;
      }
    }

    // If no price found before date, return first available price
    return sortedPrices.length > 0 ? sortedPrices[0].close : 0;
  }

  /**
   * Find the maximum peak-to-trough decline (Max Drawdown)
   */
  private calculateMaxDrawdown(priceHistory: PriceHistory): number {
    if (!priceHistory.prices || priceHistory.prices.length < 2) return 0;

    let peak = priceHistory.prices[0].close;
    let maxDrawdown = 0;

    for (const price of priceHistory.prices) {
      if (price.close > peak) {
        peak = price.close;
      }

      const drawdown = ((price.close - peak) / peak) * 100;
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  /**
   * Calculate current price vs all-time high
   */
  private calculateCurrentDrawdown(priceHistory: PriceHistory): number {
    if (!priceHistory.prices || priceHistory.prices.length === 0) return 0;

    const currentPrice = priceHistory.prices[priceHistory.prices.length - 1].close;
    const peak = Math.max(...priceHistory.prices.map((p) => p.close));

    if (peak === 0) return 0;
    return ((currentPrice - peak) / peak) * 100;
  }

  /**
   * Calculates the number of trading days during the current open holding period
   * where the position’s market value was below its cumulative invested cost.
   *
   * How it works:
   * - Walks forward day by day from the earliest open transaction date
   *   to the latest available price date.
   * - On each day, applies any open transaction for that date
   *   (adds to total invested amount and share count).
   * - For days with a market close price, compares:
   *       (close price × shares held) vs cumulative invested amount.
   * - Counts the day as "underwater" when market value < invested amount.
   *
   * Notes / assumptions:
   * - There is at most one open transaction per calendar day.
   * - Open transactions represent buys contributing to the current open position.
   * - Cost basis is time-varying and reflects cumulative invested amount up to that day.
   * - Only days with available price data are counted (trading days).
   * - Days before the first open transaction are ignored.
   *
   * @returns Number of trading days the position was underwater.
   */
  private calculateDaysUnderwater(openTransactions: OpenTransaction[], priceHistory: PriceHistory): number {
    if (!openTransactions?.length || !priceHistory.prices?.length) return 0;

    const openTransactionByDate = openTransactions.reduce(
      (acc, t) => {
        acc[t.date.format(DATE_FORMAT)] = t; // one per day
        return acc;
      },
      {} as Record<string, OpenTransaction>,
    );

    let currentDate = openTransactions[0].date;
    const endDate = dayjs(priceHistory.prices[priceHistory.prices.length - 1].date);

    const priceHistoryByDate = priceHistory.prices.reduce(
      (acc, p) => {
        acc[dayjs(p.date).format(DATE_FORMAT)] = p.close;
        return acc;
      },
      {} as Record<string, number>,
    );

    let currentBuyValue = 0; // $
    let currentShares = 0; // shares
    let daysUnderwater = 0;

    while (currentDate.isSameOrBefore(endDate, 'day')) {
      const key = currentDate.format(DATE_FORMAT);

      const tx = openTransactionByDate[key];
      if (tx) {
        currentBuyValue += tx.amount;
        currentShares += tx.shares;
      }

      if (isTradingDay(currentDate)) {
        const close = priceHistoryByDate[key];
        if (close && currentShares > 0 && close * currentShares < currentBuyValue) {
          daysUnderwater++;
        }
      }

      currentDate = currentDate.add(1, 'day');
    }

    return daysUnderwater;
  }

  /**
   * Calculate annualized standard deviation of daily returns
   */
  private calculateVolatility(priceHistory: PriceHistory): number {
    if (!priceHistory.prices || priceHistory.prices.length < 2) return 0;

    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < priceHistory.prices.length; i++) {
      const prevPrice = priceHistory.prices[i - 1].close;
      const currPrice = priceHistory.prices[i].close;
      if (prevPrice > 0) {
        returns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    if (returns.length === 0) return 0;

    // Calculate standard deviation
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const dailyStdDev = Math.sqrt(variance);

    // Annualize (assume 252 trading days per year)
    return dailyStdDev * Math.sqrt(252);
  }

  /**
   * Calculate Sharpe Ratio
   * (AnnualizedReturn - RiskFreeRate) / Volatility
   */
  private calculateSharpeRatio(priceHistory: PriceHistory, riskFreeRate: number = 0.04): number {
    // Use price-only return for Sharpe ratio to match volatility calculation
    // (volatility is based on price changes only)
    const annualizedReturn = this.calculatePriceReturn(priceHistory, dayjs().subtract(1, 'year')) / 100;
    const volatility = this.calculateVolatility(priceHistory);

    if (volatility === 0) return 0;

    return (annualizedReturn - riskFreeRate) / volatility;
  }

  /**
   * Calculate current dividend yield
   */
  private calculateDividendYield(transactions: Transaction[], position: Position): number {
    const dividendTxs = transactions.filter((t) => t.type === 'dividend' || t.type === 'distribution');
    if (dividendTxs.length === 0) return 0;

    // Get dividends from last 12 months
    const oneYearAgo = dayjs().subtract(1, 'year');
    const recentDividends = dividendTxs.filter((t) => dayjs(t.date).isAfter(oneYearAgo));

    const annualDividends = recentDividends.reduce((sum, t) => sum + t.amount, 0);
    const currentPrice = position.security.last_price;
    if (!currentPrice) return 0;

    return (annualDividends / currentPrice / position.quantity) * 100;
  }

  /**
   * Calculate dividend growth rate
   */
  private calculateDividendGrowth(_transactions: Transaction[]): number {
    const transactions = _transactions;
    const dividendTxs = transactions
      .filter((t) => t.type === 'dividend' || t.type === 'distribution')
      .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

    if (dividendTxs.length < 2) return 0;

    // Group by year and sum
    const yearlyDividends = new Map<number, number>();
    for (const tx of dividendTxs) {
      const year = dayjs(tx.date).year();
      yearlyDividends.set(year, (yearlyDividends.get(year) || 0) + tx.amount);
    }

    const years = Array.from(yearlyDividends.keys()).sort();
    if (years.length < 2) return 0;

    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const numYears = lastYear - firstYear;

    if (numYears === 0) return 0;

    const firstYearDiv = yearlyDividends.get(firstYear) || 0;
    const lastYearDiv = yearlyDividends.get(lastYear) || 0;

    if (firstYearDiv === 0) return 0;

    const growth = (lastYearDiv / firstYearDiv) ** (1 / numYears) - 1;
    return growth * 100;
  }

  /**
   * Determine dividend trend based on transaction history
   */
  private determineDividendTrend(transactions: Transaction[]): DividendTrend {
    const dividendTxs = transactions.filter((t) => t.type === 'dividend' || t.type === 'distribution');

    if (dividendTxs.length === 0) return 'none';

    // Check if dividends have been suspended (no dividends in last 12 months)
    const oneYearAgo = dayjs().subtract(1, 'year');
    const recentDividends = dividendTxs.filter((t) => dayjs(t.date).isAfter(oneYearAgo));

    if (recentDividends.length === 0 && dividendTxs.length > 0) {
      return 'suspended';
    }

    const growth = this.calculateDividendGrowth(transactions);

    if (growth >= 3) return 'growing';
    if (growth <= -3) return 'declining';
    return 'flat';
  }

  /**
   * Calculate number of days since first open purchase
   */
  private calculateHoldingPeriodDays(openTransactions: OpenTransaction[]): number {
    if (openTransactions.length === 0) return 0;

    return openTransactions[openTransactions.length - 1].date.diff(openTransactions[0].date, 'day');
  }
}
