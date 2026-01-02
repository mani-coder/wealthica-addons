/**
 * Benchmark Selector Component
 *
 * Reusable dropdown for selecting benchmark index to compare against.
 * Displays benchmark name, symbol, and currency.
 */

import { Select } from 'antd';
import { trackEvent } from '@/analytics';
import { useBenchmark } from '../../context/BenchmarkContext';
import { BENCHMARKS } from '../../utils/benchmarkData';

interface Props {
  /** Optional custom width for the select dropdown (default: 300) */
  width?: number;
  /** Optional analytics event name (default: 'benchmark-change') */
  analyticsEvent?: string;
}

const BENCHMARK_OPTIONS = Object.entries(BENCHMARKS).map(([key, info]) => ({
  label: `${info.name} (${key}) - ${info.currency}`,
  value: info.symbol,
}));

export function BenchmarkSelector({ width = 300, analyticsEvent = 'benchmark-change' }: Props) {
  const { selectedBenchmark, setSelectedBenchmark } = useBenchmark();

  return (
    <Select
      value={selectedBenchmark}
      onChange={(value) => {
        setSelectedBenchmark(value);
        trackEvent(analyticsEvent, { benchmarkId: value });
      }}
      style={{ width }}
      options={BENCHMARK_OPTIONS}
    />
  );
}
