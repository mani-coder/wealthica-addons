/* eslint-disable react-hooks/exhaustive-deps */
import Typography from 'antd/es/typography';
import Table, { ColumnProps } from 'antd/lib/table';
import React, { useMemo } from 'react';
import { Box } from 'rebass';
import { Account } from '../types';
import { formatMoney, getCurrencyInCAD } from '../utils';
import Collapsible from './Collapsible';

type Props = {
  accounts: Account[];
  currencyCache: { [K: string]: number };
  isPrivateMode: boolean;
};

function CashTable(props: Props) {
  const currencyCacheKeys = Object.keys(props.currencyCache);
  const lastCurrencyDate = currencyCacheKeys[currencyCacheKeys.length - 1];
  const accounts = useMemo(() => {
    return props.accounts.filter((acc) => acc.cash && acc.cash !== 0).sort((a, b) => b.cash - a.cash);
  }, [props.accounts]);

  function getColumns(): ColumnProps<Account>[] {
    return [
      {
        key: 'institution',
        title: 'Institution',
        dataIndex: 'instutitionName',
        sorter: (a, b) => a.instutitionName.localeCompare(b.instutitionName),
        filters: Array.from(new Set(accounts.map((acc) => acc.instutitionName)))
          .filter((value) => !!value)
          .map((value) => ({
            text: value,
            value: value || '',
          }))
          .sort((a, b) => a.value.localeCompare(b.value)),
        onFilter: (value, account) => !!account.instutitionName && account.instutitionName.indexOf(value as any) === 0,
      },
      {
        key: 'name',
        title: 'Name',
        dataIndex: 'name',
        sorter: (a, b) => a.name.localeCompare(b.name),
        filters: Array.from(new Set(accounts.map((acc) => acc.name)))
          .filter((value) => !!value)
          .map((value) => ({
            text: value,
            value: value || '',
          }))
          .sort((a, b) => a.value.localeCompare(b.value)),
        onFilter: (value, account) => !!account.name && account.name.indexOf(value as any) === 0,
      },
      {
        key: 'currency',
        title: 'Currency',
        dataIndex: 'currency',
        render: (currency: string) => currency.toUpperCase(),
        sorter: (a, b) => a.currency.localeCompare(b.currency),
        width: 100,
        filters: [
          { value: 'cad', text: 'CAD' },
          { value: 'usd', text: 'USD' },
        ],
        onFilter: (value, account) => !!account.currency && account.currency.indexOf(value as any) === 0,
      },

      {
        key: 'Cash',
        title: 'Cash',
        align: 'right',
        dataIndex: 'cash',
        render: (cash: number, account: Account) => (
          <Typography.Text style={{ color: cash < 0 ? 'red' : '', fontSize: 14 }}>
            {formatMoney(cash, 2)} {account.currency.toUpperCase()}
          </Typography.Text>
        ),
        sorter: (a, b) => a.cash - b.cash,
      },
      {
        key: 'cadCash',
        title: 'Cash In CAD',
        align: 'right',
        dataIndex: 'cash',
        render: (cash: number, account: Account) => (
          <Typography.Text strong style={{ color: cash < 0 ? 'red' : '', fontSize: 14 }}>
            {formatMoney(
              account.currency === 'usd' ? getCurrencyInCAD(lastCurrencyDate, cash, props.currencyCache) : cash,
            )}{' '}
            CAD
          </Typography.Text>
        ),
        sorter: (a, b) => a.cash - b.cash,
      },
    ];
  }

  return (
    <div className="zero-padding">
      <Collapsible title="Cash Table">
        <Table<Account>
          rowKey="id"
          pagination={false}
          scroll={{ y: 500 }}
          summary={(accounts) => {
            const totalCAD = accounts
              .filter((a) => a.currency === 'cad')
              .reduce((total, account) => total + account.cash, 0);

            const totalUSD = accounts
              .filter((a) => a.currency === 'usd')
              .reduce((total, account) => total + account.cash, 0);

            const total = totalCAD + getCurrencyInCAD(lastCurrencyDate, totalUSD, props.currencyCache);

            return (
              <>
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={3} align="right" index={0}>
                    <Box pb={1}>
                      <Typography.Text strong>CAD Total</Typography.Text>
                    </Box>
                    <Typography.Text strong>USD Total</Typography.Text>
                  </Table.Summary.Cell>

                  <Table.Summary.Cell index={1} colSpan={1} align="right">
                    <Box pb={1}>
                      <Typography.Text strong style={{ color: totalCAD >= 0 ? 'green' : 'red' }}>
                        {formatMoney(totalCAD)} CAD
                      </Typography.Text>
                    </Box>
                    <Typography.Text strong style={{ color: totalUSD >= 0 ? 'green' : 'red' }}>
                      {formatMoney(totalUSD)} USD
                    </Typography.Text>
                  </Table.Summary.Cell>

                  <Table.Summary.Cell index={1} colSpan={1} align="right">
                    <Typography.Text strong style={{ color: total >= 0 ? 'green' : 'red' }}>
                      {formatMoney(total)} CAD
                    </Typography.Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </>
            );
          }}
          dataSource={accounts}
          columns={getColumns()}
        />
      </Collapsible>
    </div>
  );
}

export default React.memo(CashTable);
