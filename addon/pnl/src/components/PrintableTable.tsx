import PrinterFilled from '@ant-design/icons/PrinterFilled';
import { Typography } from 'antd';
import Button from 'antd/lib/button';
import Table, { TableProps } from 'antd/lib/table';
import React from 'react';
import { Flex } from 'rebass';
import { usePrint } from '../hooks/usePrint';

export default function PrintableTable<T extends object>({
  printTitle,
  ...props
}: TableProps<T> & { printTitle: string }) {
  const printableTable = (
    <Table<T>
      {...props}
      title={() => (
        <Flex width={1} justifyContent="center">
          <Typography.Title level={4}>{printTitle}</Typography.Title>
        </Flex>
      )}
      pagination={false}
    />
  );
  const { print, printing } = usePrint({
    title: printTitle.replaceAll(',', '_').replaceAll(' ', '_'),
    children: printableTable,
  });

  return (
    <div style={{ position: 'relative' }}>
      <Table<T> {...props} />
      <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
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
