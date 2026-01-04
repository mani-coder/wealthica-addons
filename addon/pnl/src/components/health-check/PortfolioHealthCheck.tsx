/**
 * Portfolio Health Check Component
 *
 * Main container for the Portfolio Health Check feature.
 * Analyzes holdings and provides actionable recommendations.
 */

import { Card, Empty, Input, List, Progress, Select, Spin, Statistic, Typography } from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSymbol } from '@/utils/common';
import { trackEvent } from '../../analytics';
import { DATE_FORMAT } from '../../constants';
import { useAddonContext } from '../../context/AddonContext';
import { useBenchmark } from '../../context/BenchmarkContext';
import type { Position } from '../../types';
import type { HealthRecommendation, PortfolioHealthSummary, Severity } from '../../types/healthCheck';
import { SEVERITY_COLORS } from '../../types/healthCheck';
import type { BenchmarkType } from '../../utils/benchmarkData';
import { BenchmarkSelector } from '../common/BenchmarkSelector';
import { HealthCards } from './HealthCards';

const { Text } = Typography;

interface Props {
  positions: Position[];
}

export function PortfolioHealthCheck({ positions }: Props) {
  const { fromDate, toDate } = useAddonContext();
  const { selectedBenchmark, benchmarkInfo, fetchBenchmarkHistory } = useBenchmark();

  const [summary, setSummary] = useState<PortfolioHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [benchmarkReturn3Y, setBenchmarkReturn3Y] = useState<number>(30); // Default assumption

  // Filter states
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [recommendationFilter, setRecommendationFilter] = useState<HealthRecommendation | 'all'>('all');
  const [symbolSearch, setSymbolSearch] = useState<string>('');

  /**
   * Fetch benchmark historical data and calculate 3-year return
   */
  const fetchBenchmarkReturn = useCallback(async () => {
    try {
      const data = await fetchBenchmarkHistory(
        dayjs(fromDate, DATE_FORMAT).subtract(3, 'years'),
        dayjs(toDate, DATE_FORMAT),
      );

      if (data && data.length > 1) {
        const firstPrice = data[0].closePrice;
        const lastPrice = data[data.length - 1].closePrice;
        const returnPercent = ((lastPrice - firstPrice) / firstPrice) * 100;
        setBenchmarkReturn3Y(returnPercent);
      }
    } catch (error) {
      console.error('Failed to fetch benchmark data:', error);
      // Keep default assumption if fetch fails
    }
  }, [fetchBenchmarkHistory, fromDate, toDate]);

  /**
   * Fetch benchmark data when benchmark changes
   */
  useEffect(() => {
    fetchBenchmarkReturn();
  }, [fetchBenchmarkReturn]);

  /**
   * Analyze portfolio on mount or when positions/benchmark changes
   */
  useEffect(() => {
    setLoading(true);
    const simplifiedSummary = createSimplifiedSummary(positions, selectedBenchmark, benchmarkReturn3Y);
    setSummary(simplifiedSummary);
    setLoading(false);
  }, [positions, selectedBenchmark, benchmarkReturn3Y]);

  /**
   * Create a simplified summary based on current position data
   * Uses basic gain_percent calculations with real benchmark return
   */
  function createSimplifiedSummary(
    positions: Position[],
    benchmarkSymbol: BenchmarkType,
    benchmarkReturn: number,
  ): PortfolioHealthSummary {
    const totalValue = positions.reduce((sum, p) => sum + p.market_value, 0);

    const reports = positions
      .map((position) => {
        // Simplified scoring based on gain_percent
        const gainPercent = position.gain_percent * 100;
        const portfolioWeight = position.market_value / totalValue;
        let score = 50; // Default neutral score

        if (gainPercent > 20) score = 85;
        else if (gainPercent > 10) score = 75;
        else if (gainPercent > 0) score = 60;
        else if (gainPercent > -10) score = 45;
        else if (gainPercent > -20) score = 30;
        else score = 15;

        // Reduce score for positions with minimal impact (less than 1% of portfolio)
        if (portfolioWeight < 0.01) {
          score = Math.max(15, score - 10); // Reduce score by 10 points, minimum 15
        }

        // Reduce score for large positions (more than 15% of portfolio) - concentration risk
        if (portfolioWeight > 0.15) {
          score = Math.max(15, score - 10); // Reduce score by 10 points, minimum 15
        }

        const severity = score <= 30 ? 'critical' : score <= 50 ? 'warning' : score <= 70 ? 'info' : 'healthy';
        const recommendation = score <= 25 ? 'SELL' : score <= 50 ? 'REVIEW' : score >= 85 ? 'ACCUMULATE' : 'HOLD';

        const flags: any[] = [];
        const flagDescriptions: string[] = [];
        const strengths: any[] = [];
        const strengthDescriptions: string[] = [];

        if (gainPercent < 0) {
          flags.push('NEGATIVE_RETURN_3Y');
          flagDescriptions.push(`Current loss of ${Math.abs(gainPercent).toFixed(1)}%`);
        }

        if (gainPercent < -15) {
          flags.push('UNDERPERFORMED_BENCHMARK');
          flagDescriptions.push('Significant underperformance');
        }

        // Flag positions that are less than 1% of portfolio (minimal impact)
        if (portfolioWeight < 0.01) {
          flags.push('SMALL_POSITION');
          flagDescriptions.push(
            `Only ${(portfolioWeight * 100).toFixed(2)}% of portfolio - consider consolidating to reduce complexity`,
          );
        }

        // Flag positions that are more than 15% of portfolio (concentration risk)
        if (portfolioWeight > 0.15) {
          flags.push('LARGE_POSITION');
          flagDescriptions.push(
            `Large position (${(portfolioWeight * 100).toFixed(1)}% of portfolio) - concentration risk`,
          );
        }

        // Identify strengths
        if (gainPercent > 0) {
          strengths.push('POSITIVE_RETURN_3Y');
          strengthDescriptions.push(`Positive return of ${gainPercent.toFixed(1)}%`);
        }

        if (gainPercent > benchmarkReturn + 5) {
          strengths.push('OUTPERFORMED_BENCHMARK');
          strengthDescriptions.push(
            `Outperformed ${benchmarkSymbol} by ${(gainPercent - benchmarkReturn).toFixed(1)}%`,
          );
        }

        return {
          symbol: getSymbol(position.security),
          name: position.security.name,
          position,
          score,
          recommendation: recommendation as any,
          severity: severity as any,
          flags,
          flagDescriptions,
          strengths,
          strengthDescriptions,
          metrics: {
            return1Y: gainPercent,
            return3Y: gainPercent,
            return5Y: gainPercent,
            returnSinceInception: gainPercent,
            xirr: position.xirr,
            benchmarkReturn1Y: benchmarkReturn,
            benchmarkReturn5Y: benchmarkReturn,
            benchmarkReturnSinceInception: benchmarkReturn,
            alpha1Y: gainPercent - benchmarkReturn,
            alpha5Y: gainPercent - benchmarkReturn,
            alphaSinceInception: gainPercent - benchmarkReturn,
            benchmarkReturn3Y: benchmarkReturn,
            alpha3Y: gainPercent - benchmarkReturn,
            opportunityCost:
              gainPercent < benchmarkReturn ? (position.market_value * (benchmarkReturn - gainPercent)) / 100 : 0,
            maxDrawdown: Math.abs(Math.min(0, gainPercent)),
            currentDrawdown: Math.min(0, gainPercent),
            daysUnderwater: gainPercent < 0 ? 365 : 0,
            holdingPeriodDays: 365 * 3, // Simplified: assume 3 year holding period
            volatility: 0.25,
            sharpeRatio: gainPercent > 0 ? 0.8 : -0.2,
            dividendYield: 0,
            dividendGrowth3Y: 0,
            dividendTrend: 'none' as any,
            portfolioWeight: position.market_value / totalValue,
            positionSize: position.market_value,
            costBasis: position.book_value,
          },
          opportunityCostDescription:
            gainPercent < benchmarkReturn
              ? `If invested in ${benchmarkSymbol} instead, you would have $${Math.round((position.market_value * (benchmarkReturn - gainPercent)) / 100).toLocaleString()} more`
              : `Outperformed ${benchmarkSymbol} - no opportunity cost`,
          suggestedAction: getSuggestedAction(recommendation as any),
        };
      })
      .sort((a, b) => a.score - b.score);

    const criticalCount = reports.filter((r) => r.severity === 'critical').length;
    const warningCount = reports.filter((r) => r.severity === 'warning').length;
    const healthyCount = reports.filter((r) => r.severity === 'healthy').length;

    const overallScore = Math.round(
      reports.reduce((sum, r) => sum + r.score * r.metrics.portfolioWeight, 0) /
        reports.reduce((sum, r) => sum + r.metrics.portfolioWeight, 0),
    );

    const totalOpportunityCost = reports.reduce((sum, r) => sum + r.metrics.opportunityCost, 0);

    const recommendations: string[] = [];
    if (criticalCount > 0) {
      recommendations.push(`You have ${criticalCount} holding(s) requiring urgent attention.`);
    }
    if (totalOpportunityCost > 5000) {
      recommendations.push(`Total opportunity cost of $${Math.round(totalOpportunityCost).toLocaleString()}.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Your portfolio looks healthy! Continue monitoring periodically.');
    }

    return {
      overallScore,
      totalOpportunityCost,
      holdingsReviewed: reports.length,
      flaggedHoldings: reports.filter((r) => r.flags.length > 0).length,
      criticalCount,
      warningCount,
      healthyCount,
      reports,
      worstPerformers: reports.slice(0, 5),
      biggestDrags: [...reports].sort((a, b) => b.metrics.opportunityCost - a.metrics.opportunityCost).slice(0, 5),
      recommendations,
      analysisDate: new Date(),
      benchmarkUsed: benchmarkSymbol,
      analysisPeriodYears: 3,
    };
  }

  function getSuggestedAction(recommendation: string): string {
    switch (recommendation) {
      case 'SELL':
        return 'Consider selling to harvest tax loss and reallocate to better performers';
      case 'REVIEW':
        return 'This holding deserves a closer look. Review your investment thesis.';
      case 'ACCUMULATE':
        return 'Strong performer. Consider adding to this position on dips.';
      default:
        return 'No immediate action needed. Continue to monitor.';
    }
  }

  /**
   * Filter reports based on selected filters and search
   */
  const filteredReports = useMemo(() => {
    if (!summary) return [];

    return summary.reports.filter((report) => {
      if (severityFilter !== 'all' && report.severity !== severityFilter) return false;
      if (recommendationFilter !== 'all' && report.recommendation !== recommendationFilter) return false;
      if (
        symbolSearch &&
        !report.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) &&
        !report.name.toLowerCase().includes(symbolSearch.toLowerCase())
      )
        return false;
      return true;
    });
  }, [summary, severityFilter, recommendationFilter, symbolSearch]);

  function getScoreColor(score: number): string {
    if (score <= 30) return SEVERITY_COLORS.critical;
    if (score <= 50) return SEVERITY_COLORS.warning;
    if (score <= 70) return SEVERITY_COLORS.info;
    return SEVERITY_COLORS.healthy;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spin size="large" tip="Analyzing your portfolio..." />
      </div>
    );
  }

  if (!summary || summary.reports.length === 0) {
    return <Empty description="No holdings to analyze" />;
  }

  return (
    <Card
      extra={
        <div className="mt-2">
          <div className="text-sm font-normal text-gray-400">Benchmark</div>
          <BenchmarkSelector analyticsEvent="health-check-benchmark-change" />
        </div>
      }
      styles={{ body: { padding: 16 } }}
      title={
        <div className="flex flex-col gap-1 py-4">
          <div className="text-2xl font-semibold text-slate-900">Portfolio Health Check</div>
          <div className="text-sm font-normal text-gray-400">
            Identify underperforming holdings and get actionable recommendations
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <Statistic
              title="Overall Health Score"
              value={summary.overallScore}
              suffix="/100"
              styles={{ content: { color: getScoreColor(summary.overallScore) } }}
            />
            <Progress
              percent={summary.overallScore}
              strokeColor={getScoreColor(summary.overallScore)}
              showInfo={false}
              size="small"
            />
          </Card>

          <Card>
            <Statistic
              title="Critical Issues"
              value={summary.criticalCount}
              styles={{ content: { color: summary.criticalCount > 0 ? SEVERITY_COLORS.critical : '#52c41a' } }}
            />
            <Text type="secondary" className="text-xs">
              Require urgent attention
            </Text>
          </Card>

          <Card>
            <Statistic
              title="Needs Review"
              value={summary.warningCount}
              styles={{ content: { color: summary.warningCount > 0 ? SEVERITY_COLORS.warning : '#52c41a' } }}
            />
            <Text type="secondary" className="text-xs">
              Should be monitored
            </Text>
          </Card>

          <Card>
            <Statistic
              title="Opportunity Cost"
              value={Math.round(summary.totalOpportunityCost)}
              prefix="$"
              styles={{ content: { color: summary.totalOpportunityCost > 5000 ? SEVERITY_COLORS.warning : '#52c41a' } }}
            />
            <Text type="secondary" className="text-xs">
              vs {benchmarkInfo.name}
            </Text>
          </Card>
        </div>

        {/* Recommendations */}
        {summary.recommendations.length > 0 && (
          <List
            size="small"
            header={<Text strong>Portfolio Insights</Text>}
            dataSource={summary.recommendations}
            renderItem={(rec) => <List.Item className="py-1">{rec}</List.Item>}
            className="bg-blue-50"
            bordered
          />
        )}

        {/* Holdings List */}
        <div>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <div className="text-lg font-semibold text-slate-900">
              Holdings Analysis ({summary.holdingsReviewed} reviewed)
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Input.Search
                placeholder="Search symbol or name..."
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                onSearch={setSymbolSearch}
                style={{ width: 200 }}
                allowClear
              />
              <div className="flex items-center gap-2">
                <Text strong>Severity:</Text>
                <Select
                  value={severityFilter}
                  onChange={(value) => {
                    setSeverityFilter(value);
                    trackEvent('health-check-severity-filter', {
                      filter: value,
                    });
                  }}
                  style={{ width: 150 }}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Critical', value: 'critical' },
                    { label: 'Warning', value: 'warning' },
                    { label: 'Info', value: 'info' },
                    { label: 'Healthy', value: 'healthy' },
                  ]}
                />
              </div>
              <div className="flex items-center gap-2">
                <Text strong>Recommendation:</Text>
                <Select
                  value={recommendationFilter}
                  onChange={(value) => {
                    setRecommendationFilter(value);
                    trackEvent('health-check-recommendation-filter', {
                      filter: value,
                    });
                  }}
                  style={{ width: 150 }}
                  options={[
                    { label: 'All', value: 'all' },
                    { label: 'Sell', value: 'SELL' },
                    { label: 'Review', value: 'REVIEW' },
                    { label: 'Hold', value: 'HOLD' },
                    { label: 'Accumulate', value: 'ACCUMULATE' },
                  ]}
                />
              </div>
            </div>
          </div>

          <HealthCards reports={filteredReports} />
        </div>
      </div>
    </Card>
  );
}
