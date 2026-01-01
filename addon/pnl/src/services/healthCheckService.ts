/**
 * Health Check Service
 *
 * This service analyzes portfolio holdings to identify underperformers
 * and provides actionable recommendations.
 */

import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
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
import { formatMoney } from '../utils/common';
import { calculateHealthScore, generateRecommendation, scoreToSeverity } from '../utils/healthScoring';
import { calculateAverageCostPerShare, calculateOpenTransactions } from '../utils/transactionUtils';

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
export interface PriceHistory {
  symbol: string;
  prices: PricePoint[];
}

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
      const priceHistory = priceHistories.get(position.security.symbol);

      if (priceHistory && priceHistory.prices.length > 0) {
        const report = await this.analyzeHolding(
          position,
          positionTransactions,
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
  async analyzeHolding(
    position: Position,
    transactions: Transaction[],
    priceHistory: PriceHistory,
    benchmarkHistory: PriceHistory,
    totalPortfolioValue: number,
  ): Promise<HoldingHealthReport> {
    // Calculate all metrics
    const metrics = this.calculateMetrics(position, transactions, priceHistory, benchmarkHistory, totalPortfolioValue);

    // Calculate score
    const score = calculateHealthScore(metrics, this.config.weights);

    // Determine flags
    const flags = this.determineFlags(metrics);
    const flagDescriptions = this.generateFlagDescriptions(flags, metrics);

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
    priceHistory: PriceHistory,
    benchmarkHistory: PriceHistory,
    totalPortfolioValue: number,
  ): HealthMetrics {
    // Calculate returns
    const return1Y = this.calculateReturn(priceHistory, 252); // ~252 trading days in a year
    const return3Y = this.calculateReturn(priceHistory, 756); // ~3 years
    const returnSinceInception = this.calculateTotalReturn(transactions, position);
    const xirr = this.calculateXIRR(position);

    // Benchmark comparison
    const benchmarkReturn3Y = this.calculateReturn(benchmarkHistory, 756);
    const alpha3Y = return3Y - benchmarkReturn3Y;

    // Opportunity cost
    const opportunityCost = this.calculateOpportunityCost(transactions, position, benchmarkHistory);

    // Drawdowns
    const maxDrawdown = this.calculateMaxDrawdown(priceHistory);
    const currentDrawdown = this.calculateCurrentDrawdown(priceHistory);

    // Underwater analysis
    const daysUnderwater = this.calculateDaysUnderwater(transactions, priceHistory);
    const percentUnderwater = this.calculatePercentUnderwater(transactions, position);
    const holdingPeriodDays = this.calculateHoldingPeriodDays(transactions);

    // Risk metrics
    const volatility = this.calculateVolatility(priceHistory);
    const sharpeRatio = this.calculateSharpeRatio(priceHistory);

    // Dividend metrics
    const dividendYield = this.calculateDividendYield(transactions, position);
    const dividendGrowth3Y = this.calculateDividendGrowth(transactions);
    const dividendTrend = this.determineDividendTrend(transactions);

    return {
      return1Y,
      return3Y,
      returnSinceInception,
      xirr,
      benchmarkReturn3Y,
      alpha3Y,
      opportunityCost,
      maxDrawdown,
      currentDrawdown,
      daysUnderwater,
      percentUnderwater,
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

    if (metrics.return3Y < 0) {
      flags.push('NEGATIVE_RETURN_3Y');
    }

    if (metrics.alpha3Y < thresholds.benchmarkUnderperformance) {
      flags.push('UNDERPERFORMED_BENCHMARK');
    }

    if (metrics.opportunityCost > thresholds.opportunityCostMin) {
      flags.push('HIGH_OPPORTUNITY_COST');
    }

    if (metrics.daysUnderwater > thresholds.underwaterDays) {
      flags.push('EXTENDED_UNDERWATER');
    }

    if (metrics.dividendTrend === 'declining' || metrics.dividendTrend === 'suspended') {
      flags.push('DECLINING_DIVIDENDS');
    }

    if (metrics.volatility > thresholds.volatilityMax && metrics.sharpeRatio < 0.5) {
      flags.push('HIGH_VOLATILITY');
    }

    if (metrics.portfolioWeight < thresholds.smallPositionThreshold) {
      flags.push('SMALL_POSITION');
    }

    return flags;
  }

  /**
   * Generate human-readable descriptions for each flag
   */
  private generateFlagDescriptions(flags: HealthFlag[], metrics: HealthMetrics): string[] {
    const descriptions: string[] = [];

    for (const flag of flags) {
      switch (flag) {
        case 'NEGATIVE_RETURN_3Y':
          descriptions.push(`Negative 3-year return of ${metrics.return3Y.toFixed(1)}%`);
          break;
        case 'UNDERPERFORMED_BENCHMARK':
          descriptions.push(
            `Underperformed ${this.config.benchmarkSymbol} by ${Math.abs(metrics.alpha3Y).toFixed(1)}%`,
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
    switch (recommendation) {
      case 'SELL':
        if (flags.includes('NEGATIVE_RETURN_3Y') && flags.includes('EXTENDED_UNDERWATER')) {
          return 'Consider selling to harvest tax loss and reallocate to better performers';
        }
        if (flags.includes('HIGH_OPPORTUNITY_COST')) {
          return 'Consider selling and investing proceeds in a broad index fund to capture market returns';
        }
        return 'This holding has multiple red flags. Consider exiting the position.';

      case 'REVIEW':
        if (flags.includes('DECLINING_DIVIDENDS')) {
          return 'Review the company fundamentals - dividend cuts often signal deeper issues';
        }
        if (flags.includes('UNDERPERFORMED_BENCHMARK')) {
          return 'Evaluate if your thesis still holds or if this capital could work harder elsewhere';
        }
        return 'This holding deserves a closer look. Review your original investment thesis.';

      case 'ACCUMULATE':
        return 'Strong performer. Consider adding to this position on dips.';

      default:
        return 'No immediate action needed. Continue to monitor.';
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
   * Calculate return over specified number of trading days
   */
  private calculateReturn(priceHistory: PriceHistory, days: number): number {
    if (!priceHistory.prices || priceHistory.prices.length < 2) return 0;

    const sortedPrices = [...priceHistory.prices].sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());

    const endPrice = sortedPrices[sortedPrices.length - 1].close;
    const startIndex = Math.max(0, sortedPrices.length - days - 1);
    const startPrice = sortedPrices[startIndex].close;

    if (!startPrice || startPrice === 0) return 0;

    return ((endPrice - startPrice) / startPrice) * 100;
  }

  /**
   * Calculate total return since first purchase including realized gains
   */
  private calculateTotalReturn(_transactions: Transaction[], position: Position): number {
    // Use the gain_percent from the position if available
    // transactions parameter kept for future use when calculating including realized gains
    return position.gain_percent || 0;
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
    transactions: Transaction[],
    position: Position,
    benchmarkHistory: PriceHistory,
  ): number {
    // Calculate open transactions with currency conversion
    // If currencies are available, amounts will be converted to base currency
    const openTransactions = calculateOpenTransactions(transactions, this.currencies);

    if (openTransactions.length === 0) return 0;

    let benchmarkValue = 0;
    let stockValue = 0;

    // Get current stock price
    const currentStockPrice = position.market_value / position.quantity;

    // Get current benchmark price
    const currentBenchmarkPrice =
      benchmarkHistory.prices.length > 0 ? benchmarkHistory.prices[benchmarkHistory.prices.length - 1].close : 0;

    for (const openTx of openTransactions) {
      // Find benchmark price on transaction date
      const txDate = dayjs(openTx.transaction.date);
      const benchmarkPrice = this.getPriceOnDate(benchmarkHistory, txDate);

      if (benchmarkPrice > 0) {
        // Amount is already converted to base currency by calculateOpenTransactions
        // Calculate how many benchmark shares could be bought with this amount
        const benchmarkShares = openTx.amount / benchmarkPrice;
        benchmarkValue += benchmarkShares * currentBenchmarkPrice;
      }

      // Calculate actual stock value using actual shares (accounts for splits)
      stockValue += openTx.shares * currentStockPrice;
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
   * Find the maximum peak-to-trough decline
   */
  private calculateMaxDrawdown(priceHistory: PriceHistory): number {
    if (!priceHistory.prices || priceHistory.prices.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = priceHistory.prices[0].close;

    for (const point of priceHistory.prices) {
      if (point.close > peak) {
        peak = point.close;
      }
      const drawdown = ((point.close - peak) / peak) * 100;
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
   * Count days where price was below average cost basis, only since first open purchase
   *
   * Days underwater means: days where you held the position AND the market price was below your cost basis.
   * If the position is currently profitable (market value > cost basis), returns 0.
   */
  private calculateDaysUnderwater(transactions: Transaction[], priceHistory: PriceHistory): number {
    const avgCostBasis = this.calculateAverageCostBasis(transactions);
    if (avgCostBasis === 0) return 0;

    // Get first purchase date from open transactions
    const openTransactions = calculateOpenTransactions(transactions, this.currencies);
    if (openTransactions.length === 0) return 0;

    const sortedOpenTxs = openTransactions.sort(
      (a, b) => dayjs(a.transaction.date).valueOf() - dayjs(b.transaction.date).valueOf(),
    );
    const firstBuyDate = dayjs(sortedOpenTxs[0].transaction.date);

    // Get current price
    const currentPrice = priceHistory.prices.length > 0 ? priceHistory.prices[priceHistory.prices.length - 1].close : 0;

    // If currently above cost basis, not underwater at all
    if (currentPrice >= avgCostBasis) {
      return 0;
    }

    // Count trading days since first open purchase (excluding weekends/holidays)
    // Price history only contains trading days, so we count entries in price history
    let daysUnderwater = 0;
    for (const point of priceHistory.prices) {
      const pointDate = dayjs(point.date);
      if (pointDate.isSameOrAfter(firstBuyDate, 'day') && point.close < avgCostBasis) {
        daysUnderwater++;
      }
    }

    return daysUnderwater;
  }

  /**
   * Calculate percentage below cost basis
   */
  private calculatePercentUnderwater(_transactions: Transaction[], position: Position): number {
    const costBasis = position.book_value; // Use book_value directly from position
    if (costBasis === 0) return 0;

    const currentValue = position.market_value;
    if (currentValue >= costBasis) return 0;

    return ((costBasis - currentValue) / costBasis) * 100;
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
    const annualizedReturn = this.calculateReturn(priceHistory, 252) / 100;
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
    const currentPrice = position.market_value / position.quantity;

    if (currentPrice === 0) return 0;
    return (annualDividends / currentPrice) * 100;
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
   * Calculate average cost per share from open transactions only
   */
  private calculateAverageCostBasis(transactions: Transaction[]): number {
    const openTransactions = calculateOpenTransactions(transactions, this.currencies);
    return calculateAverageCostPerShare(openTransactions);
  }

  /**
   * Calculate number of days since first open purchase
   */
  private calculateHoldingPeriodDays(transactions: Transaction[]): number {
    const openTransactions = calculateOpenTransactions(transactions, this.currencies);
    if (openTransactions.length === 0) return 0;

    // Get the earliest buy date from open transactions
    const sortedOpenTxs = openTransactions.sort(
      (a, b) => dayjs(a.transaction.date).valueOf() - dayjs(b.transaction.date).valueOf(),
    );
    const firstBuyDate = dayjs(sortedOpenTxs[0].transaction.date);
    const today = dayjs();

    return today.diff(firstBuyDate, 'day');
  }
}
