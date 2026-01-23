/* eslint-disable react-hooks/exhaustive-deps */
import { Table, type TableColumnProps, Typography } from 'antd';
import React, { useMemo } from 'react';
import useCurrency from '../hooks/useCurrency';
import type { Account } from '../types';
import { formatMoney, sumOf } from '../utils/common';
import Collapsible from './Collapsible';

type Props = { accounts: Account[] };

function CashTable(props: Props) {
  const { baseCurrencyDisplay, getValue, allCurrencies } = useCurrency();
  const cashComparator = (a: Account, b: Account) => getValue(b.currency, b.cash) - getValue(a.currency, a.cash);

  const accounts = useMemo(() => {
    return props.accounts.filter((acc) => acc.cash && acc.cash !== 0).sort(cashComparator);
  }, [props.accounts, cashComparator]);

  const currencies = useMemo(() => {
    return allCurrencies.map((currency) => ({ value: currency, text: currency.toUpperCase() }));
  }, [allCurrencies]);

  function getColumns(): TableColumnProps<Account>[] {
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
        width: 150,
        filters: currencies,
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
        sorter: cashComparator,
      },
      {
        key: 'baseCurrencyCash',
        title: `Cash In ${baseCurrencyDisplay}`,
        align: 'right',
        dataIndex: 'cash',
        render: (cash: number, account: Account) => (
          <Typography.Text strong style={{ color: cash < 0 ? 'red' : '', fontSize: 14 }}>
            {formatMoney(getValue(account.currency, cash))} {baseCurrencyDisplay}
          </Typography.Text>
        ),
        sorter: cashComparator,
      },
    ];
  }

  return (
    <div className="mb-2">
      <Collapsible title="Cash Table">
        <Table<Account>
          rowKey={(row) => `${row.id}:${row.institution}:${row.name}:${row.currency}`}
          pagination={false}
          scroll={{ y: 500 }}
          summary={(accounts) => {
            const currencyValues = accounts.reduce((hash: { [key: string]: any }, account) => {
              if (!hash[account.currency]) hash[account.currency] = 0;
              hash[account.currency] += account.cash;
              return hash;
            }, {});

            const total = sumOf(
              ...Object.keys(currencyValues).map((currency) => getValue(currency, currencyValues[currency])),
            );

            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={1} colSpan={4} align="right">
                    <div className="flex flex-row px-4 justify-evenly mb-2">
                      {Object.keys(currencyValues).map((currency) => (
                        <div key={currency} className="px-4">
                          <Typography.Text strong style={{ color: currencyValues[currency] >= 0 ? 'green' : 'red' }}>
                            {formatMoney(currencyValues[currency])} {currency.toUpperCase()}
                          </Typography.Text>
                        </div>
                      ))}
                    </div>
                  </Table.Summary.Cell>

                  <Table.Summary.Cell index={1} colSpan={1} align="right">
                    <Typography.Text style={{ paddingRight: 8 }}>Total:</Typography.Text>
                    <Typography.Text strong style={{ color: total >= 0 ? 'green' : 'red' }}>
                      {formatMoney(total)} {baseCurrencyDisplay}
                    </Typography.Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
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
