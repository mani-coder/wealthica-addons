import PrinterFilled from '@ant-design/icons/PrinterFilled';
import { Button, Table, TableProps, Typography } from 'antd';

import { usePrint } from '../hooks/usePrint';
import { isChrome } from '../utils/common';

const PRINT_SETTINGS = `
  @page {
    size: portrait;
  }
`;

export default function PrintableTable<T extends object>({
  printTitle,
  ...props
}: TableProps<T> & { printTitle: string }) {
  const enablePrint = !isChrome() || process.env.NODE_ENV === 'development';

  const printableTable = (
    <>
      <style type="text/css" media="print">
        {PRINT_SETTINGS}
      </style>

      <Table<T>
        {...props}
        bordered
        expandable={{
          ...props.expandable,
          defaultExpandAllRows: true,
        }}
        title={() => (
          <div className="flex w-full justify-center mb-2">
            <Typography.Title level={4}>{printTitle}</Typography.Title>
          </div>
        )}
        pagination={false}
      />
    </>
  );
  const { print, printing } = usePrint({
    title: printTitle.replaceAll(',', '_').replaceAll(' ', '_'),
    children: printableTable,
  });

  return (
    <div style={{ position: 'relative' }}>
      <Table<T> scroll={{ y: 500 }} pagination={false} {...props} />
      <div style={{ position: 'absolute', bottom: 12, right: 12, display: enablePrint ? 'block' : 'none' }}>
        <Button
          type="primary"
          shape="circle"
          size="middle"
          ghost
          onClick={() => print(true)}
          icon={<PrinterFilled />}
          loading={printing}
        />
      </div>
    </div>
  );
}
