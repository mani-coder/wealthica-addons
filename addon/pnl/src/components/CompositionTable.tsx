import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useAddonContext } from '../context/AddonContext';
import { formatMoney } from '../utils/common';
import type { GroupType } from '../utils/compositionHelpers';
import { startCase } from '../utils/lodash-replacements';

type CompositionDataItem = {
  name: string;
  value: number;
  percentage: number;
  color?: string;
};

type Props = {
  data: CompositionDataItem[];
  baseCurrency: string;
  totalValue: number;
  groupType: GroupType;
};

export default function CompositionTable({ data, baseCurrency, totalValue, groupType }: Props) {
  const { isPrivateMode } = useAddonContext();

  const groupTitle = useMemo(() => {
    if (groupType === 'type') return 'Account Type';
    return startCase(groupType);
  }, [groupType]);

  const columns: ColumnsType<CompositionDataItem> = useMemo(
    () => [
      {
        title: groupTitle,
        dataIndex: 'name',
        key: 'name',
        render: (name: string, record: CompositionDataItem) => (
          <div className="flex items-center">
            {record.color && <div className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: record.color }} />}
            <span>{name}</span>
          </div>
        ),
      },
      {
        title: 'Value',
        dataIndex: 'value',
        key: 'value',
        align: 'right',
        render: (value: number) => (isPrivateMode ? '-' : `${baseCurrency} ${formatMoney(value)}`),
      },
      {
        title: 'Allocation',
        dataIndex: 'percentage',
        key: 'percentage',
        align: 'right',
        render: (percentage: number) => `${Math.round(percentage)}%`,
      },
    ],
    [baseCurrency, isPrivateMode, groupTitle],
  );

  const dataWithTotal = useMemo(() => {
    return [
      ...data,
      {
        name: 'Total',
        value: totalValue,
        percentage: 100,
      },
    ];
  }, [data, totalValue]);

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
