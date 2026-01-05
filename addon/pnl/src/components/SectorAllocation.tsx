import { Table } from 'antd';
import type * as Highcharts from 'highcharts';
import { useMemo } from 'react';
import { useAddonContext } from '../context/AddonContext';
import useCurrency from '../hooks/useCurrency';
import { useSectorEnrichment } from '../hooks/useSectorEnrichment';
import type { Account } from '../types';
import { getOptionsV2 } from '../utils/chartHelpers';
import { formatMoney, getYahooSymbol } from '../utils/common';
import { Charts } from './Charts';
import Collapsible from './Collapsible';

type Props = {
  accounts: Account[];
};

type SectorRow = {
  key: string;
  sector: string;
  value: number;
  percentage: number;
  color: string;
};

const COLORS = [
  '#7cb5ec',
  '#434348',
  '#90ed7d',
  '#f7a35c',
  '#8085e9',
  '#f15c80',
  '#e4d354',
  '#2b908f',
  '#f45b5b',
  '#91e8e1',
];

export default function SectorAllocation(props: Props) {
  const { isPrivateMode } = useAddonContext();
  const { getValue, baseCurrencyDisplay } = useCurrency();
  const { accountsWithSectors, fundSectorWeightings } = useSectorEnrichment(props.accounts);

  // Calculate sector data with ETF weightings
  const sectorData = useMemo(() => {
    const sectorMap: { [key: string]: number } = {};
    let totalValue = 0;

    accountsWithSectors.forEach((account) => {
      account.positions.forEach((position) => {
        const value = getValue(position.currency, position.market_value);
        totalValue += value;

        // Check position type
        const positionType = (position as any).type;

        // Crypto - use direct assignment to 'Crypto' sector
        if (positionType === 'crypto') {
          sectorMap.Crypto = (sectorMap.Crypto || 0) + value;
          return;
        }

        // Check if this is an ETF or mutual fund with sector weightings
        const yahooSymbol = getYahooSymbol(position.security);
        const fundWeightings = fundSectorWeightings.get(yahooSymbol);

        if (
          (positionType === 'etf' || positionType === 'mutual_fund') &&
          fundWeightings &&
          Object.keys(fundWeightings).length > 0
        ) {
          // Distribute the fund value across sectors based on its weightings
          Object.entries(fundWeightings).forEach(([sector, weight]) => {
            const sectorValue = value * weight;
            sectorMap[sector] = (sectorMap[sector] || 0) + sectorValue;
          });
        } else {
          // Regular stock or fund without weightings - use the sector that was assigned in the enrichment step
          const sector = (position as any).sector || 'Unknown';
          sectorMap[sector] = (sectorMap[sector] || 0) + value;
        }
      });
    });

    return Object.entries(sectorMap)
      .map(([sector, value], index) => ({
        key: sector,
        sector,
        value,
        percentage: (value / totalValue) * 100,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [accountsWithSectors, getValue, fundSectorWeightings]);

  // Prepare chart options
  const chartOptions = useMemo((): Highcharts.Options => {
    const series: Highcharts.SeriesPieOptions = {
      type: 'pie',
      name: 'Sector Allocation',
      data: sectorData.map((sector) => ({
        name: sector.sector,
        y: sector.value,
        color: sector.color,
        percentage: sector.percentage,
      })),
      dataLabels: {
        enabled: false, // Disable labels on the chart since we have the table
      },
      tooltip: {
        headerFormat: '<b>{point.key}<br />{point.percentage:.1f}%</b><hr />',
        pointFormatter() {
          const point = this.options as any;
          return `${isPrivateMode ? '-' : `${baseCurrencyDisplay} ${formatMoney(point.y)}`}<br/>`;
        },
      },
    };

    return getOptionsV2({
      title: undefined, // No title on the chart itself
      series: [series],
      isPrivateMode,
    });
  }, [sectorData, isPrivateMode, baseCurrencyDisplay]);

  // Table columns
  const columns = [
    {
      title: 'Sector',
      dataIndex: 'sector',
      key: 'sector',
      render: (text: string, record: SectorRow) => (
        <div className="flex items-center gap-2">
          <div style={{ width: 16, height: 16, backgroundColor: record.color, borderRadius: 4 }} />
          <span className="font-medium">{text}</span>
        </div>
      ),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      align: 'right' as const,
      render: (value: number) => <span>{isPrivateMode ? '-' : `${baseCurrencyDisplay} ${formatMoney(value)}`}</span>,
    },
    {
      title: 'Allocation',
      dataIndex: 'percentage',
      key: 'percentage',
      align: 'right' as const,
      render: (percentage: number) => <span className="font-semibold text-emerald-600">{percentage.toFixed(2)}%</span>,
    },
  ];

  return (
    <Collapsible title="Sector Allocation">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
        {/* Pie Chart */}
        <div className="flex items-center justify-center">
          <Charts options={chartOptions} />
        </div>

        {/* Table */}
        <div>
          <Table
            dataSource={sectorData}
            columns={columns}
            pagination={false}
            size="small"
            bordered
            summary={(pageData) => {
              const totalValue = pageData.reduce((sum, row) => sum + row.value, 0);
              return (
                <Table.Summary.Row style={{ fontWeight: 'bold' }}>
                  <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    {isPrivateMode ? '-' : `${baseCurrencyDisplay} ${formatMoney(totalValue)}`}
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    100.00%
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />
        </div>
      </div>
    </Collapsible>
  );
}
