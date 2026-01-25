import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useAddonContext } from '../../context/AddonContext';
import { formatMoney } from '../../utils/common';
import type { GroupType } from '../../utils/compositionHelpers';
import { startCase } from '../../utils/lodash-replacements';

type RealizedPnLCompositionDataItem = {
  name: string;
  pnl: number;
  income: number;
  expense: number;
  total: number;
  color?: string;
};

type Props = {
  data: RealizedPnLCompositionDataItem[];
  baseCurrency: string;
  totalPnL: number;
  totalIncome: number;
  totalExpense: number;
  totalValue: number;
  groupType: GroupType;
};

export default function RealizedPnLCompositionTable({
  data,
  baseCurrency,
  totalPnL,
  totalIncome,
  totalExpense,
  totalValue,
  groupType,
}: Props) {
  const { isPrivateMode } = useAddonContext();

  const groupTitle = useMemo(() => {
    if (groupType === 'type') return 'Account Type';
    return startCase(groupType);
  }, [groupType]);

  const columns: ColumnsType<RealizedPnLCompositionDataItem> = useMemo(
    () => [
      {
        title: groupTitle,
        dataIndex: 'name',
        key: 'name',
        render: (name: string, record: RealizedPnLCompositionDataItem) => (
          <div className="flex items-center">
            {record.color && <div className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: record.color }} />}
            <span>{name}</span>
          </div>
        ),
      },
      {
        title: `P&L (${baseCurrency})`,
        dataIndex: 'pnl',
        key: 'pnl',
        align: 'right',
        render: (value: number) => (
          <span style={{ color: value < 0 ? 'red' : value > 0 ? 'green' : undefined }}>
            {isPrivateMode ? '-' : formatMoney(value)}
          </span>
        ),
      },
      {
        title: `Income (${baseCurrency})`,
        dataIndex: 'income',
        key: 'income',
        align: 'right',
        render: (value: number) => (
          <span style={{ color: value > 0 ? 'green' : undefined }}>{isPrivateMode ? '-' : formatMoney(value)}</span>
        ),
      },
      {
        title: `Expenses (${baseCurrency})`,
        dataIndex: 'expense',
        key: 'expense',
        align: 'right',
        render: (value: number) => (
          <span style={{ color: value > 0 ? 'red' : undefined }}>{isPrivateMode ? '-' : formatMoney(value)}</span>
        ),
      },
      {
        title: `Total (${baseCurrency})`,
        dataIndex: 'total',
        key: 'total',
        align: 'right',
        render: (value: number) => (
          <span style={{ color: value < 0 ? 'red' : value > 0 ? 'green' : undefined }}>
            {isPrivateMode ? '-' : formatMoney(value)}
          </span>
        ),
      },
    ],
    [baseCurrency, isPrivateMode, groupTitle],
  );

  const dataWithTotal = useMemo(() => {
    return [
      ...data,
      {
        name: 'Total',
        pnl: totalPnL,
        income: totalIncome,
        expense: totalExpense,
        total: totalValue,
      },
    ];
  }, [data, totalPnL, totalIncome, totalExpense, totalValue]);

  return (
    <Table
      columns={columns}
      dataSource={dataWithTotal}
      pagination={false}
      bordered
      size="small"
      rowKey="name"
      rowClassName={(record) => (record.name === 'Total' ? 'font-bold bg-gray-50' : '')}
    />
  );
}
