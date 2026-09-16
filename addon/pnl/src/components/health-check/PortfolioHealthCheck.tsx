import { Card, Input, Segmented, Select, Statistic, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { trackEvent } from '../../analytics';
import type { Position } from '../../types';
import { buildPortfolioReview, type PortfolioReviewCategory } from '../../utils/portfolioHealth';
import { BenchmarkSelector } from '../common/BenchmarkSelector';
import { HealthCards } from './HealthCards';

const { Text } = Typography;

interface Props {
  positions: Position[];
}

type ReviewView = 'needs_review' | 'all' | 'clear';
type ReasonFilter = PortfolioReviewCategory | 'all';

export default function PortfolioHealthCheck({ positions }: Props) {
  const summary = useMemo(() => buildPortfolioReview(positions), [positions]);
  const [view, setView] = useState<ReviewView>('needs_review');
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('all');
  const [symbolSearch, setSymbolSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = symbolSearch.trim().toLowerCase();
    return summary.items.filter((item) => {
      if (view === 'needs_review' && item.reasons.length === 0) return false;
      if (view === 'clear' && item.reasons.length > 0) return false;
      if (reasonFilter !== 'all' && !item.reasons.some((reason) => reason.category === reasonFilter)) return false;
      return !query || item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
    });
  }, [reasonFilter, summary.items, symbolSearch, view]);

  return (
    <Card
      extra={
        <div className="mt-2">
          <div className="text-sm font-normal text-gray-400">Benchmark for expanded analysis</div>
          <BenchmarkSelector analyticsEvent="health-check-benchmark-change" />
        </div>
      }
      styles={{ body: { padding: 0 } }}
      title={
        <div className="flex flex-col gap-1 py-4">
          <div className="text-2xl font-semibold text-slate-900">Portfolio Health Check</div>
          <div className="text-sm font-normal text-gray-400">
            Review observable data quality, cost-basis snapshots, and exposure thresholds
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        <Typography.Paragraph type="secondary" className="!mb-0">
          Health Check reports facts visible in the portfolio data. It does not assign investment-quality scores or
          suggest trades. Open a holding for its historical comparison with the selected benchmark.
        </Typography.Paragraph>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card size="small">
            <Statistic title="Holdings reviewed" value={summary.holdingsReviewed} />
            <Text type="secondary" className="text-xs">
              Current positions
            </Text>
          </Card>
          <Card size="small">
            <Statistic
              title="Needs review"
              value={summary.needsReview}
              styles={{ content: { color: summary.needsReview > 0 ? '#f97316' : '#10b981' } }}
            />
            <Text type="secondary" className="text-xs">
              One or more visible flags
            </Text>
          </Card>
          <Card size="small">
            <Statistic
              title="Data gaps"
              value={summary.dataGapCount}
              styles={{ content: { color: summary.dataGapCount > 0 ? '#ef4444' : '#10b981' } }}
            />
            <Text type="secondary" className="text-xs">
              Missing fields or transaction history
            </Text>
          </Card>
          <Card size="small">
            <Statistic
              title="Concentration flags"
              value={summary.concentrationCount}
              styles={{ content: { color: summary.concentrationCount > 0 ? '#f97316' : '#10b981' } }}
            />
            <Text type="secondary" className="text-xs">
              Above 15% of portfolio
            </Text>
          </Card>
        </div>

        <div className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">Snapshot:</span> {summary.belowCostBasisCount} below cost basis ·{' '}
          {summary.smallAllocationCount} below 1% allocation · {summary.dataGapCount} with incomplete data
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <Segmented
            value={view}
            options={[
              { label: `Needs review (${summary.needsReview})`, value: 'needs_review' },
              { label: `All holdings (${summary.holdingsReviewed})`, value: 'all' },
              { label: `No flags (${summary.holdingsReviewed - summary.needsReview})`, value: 'clear' },
            ]}
            onChange={(value) => {
              setView(value as ReviewView);
              trackEvent('health-check-view-change', { view: value });
            }}
          />
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <Select
              aria-label="Filter by review reason"
              value={reasonFilter}
              className="min-w-[170px]"
              options={[
                { label: 'All reasons', value: 'all' },
                { label: 'Data quality', value: 'data' },
                { label: 'Cost basis', value: 'cost_basis' },
                { label: 'Concentration', value: 'concentration' },
                { label: 'Small allocation', value: 'allocation' },
              ]}
              onChange={(value) => {
                setReasonFilter(value);
                trackEvent('health-check-reason-filter', { filter: value });
              }}
            />
            <Input.Search
              allowClear
              className="min-w-[220px] flex-1 sm:w-[260px]"
              placeholder="Search ticker or company"
              value={symbolSearch}
              onChange={(event) => setSymbolSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      <HealthCards reports={filteredItems} />
    </Card>
  );
}
