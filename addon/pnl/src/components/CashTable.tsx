/* eslint-disable react-hooks/exhaustive-deps */
import Typography from 'antd/es/typography';
import Table, { ColumnProps } from 'antd/lib/table';
import React, { useMemo } from 'react';
import { Box, Flex } from 'rebass';
import { Account, CurrencyCache } from '../types';
import { formatMoney, getCurrencyInCAD, sumOf } from '../utils';
import Collapsible from './Collapsible';
import moment from 'moment';

type Props = {
  accounts: Account[];
  currencyCache: CurrencyCache;
  isPrivateMode: boolean;
};

function CashTable(props: Props) {
  const cashComparator = (a: Account, b: Account) =>
    getCurrencyInCAD(moment(), b.cash, props.currencyCache, b.currency) -
    getCurrencyInCAD(moment(), a.cash, props.currencyCache, a.currency);

  const accounts = useMemo(() => {
    return props.accounts.filter((acc) => acc.cash && acc.cash !== 0).sort(cashComparator);
  }, [props.accounts]);

  const currencies = [{ value: 'cad', text: 'CAD' }].concat(
    ...Object.keys(props.currencyCache).map((currency) => ({ value: currency, text: currency.toUpperCase() })),
  );
  console.log('mani is cool', currencies);

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
        width: 120,
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
        key: 'cadCash',
        title: 'Cash In CAD',
        align: 'right',
        dataIndex: 'cash',
        render: (cash: number, account: Account) => (
          <Typography.Text strong style={{ color: cash < 0 ? 'red' : '', fontSize: 14 }}>
            {formatMoney(getCurrencyInCAD(moment(), cash, props.currencyCache, account.currency))} CAD
          </Typography.Text>
        ),
        sorter: cashComparator,
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
            const currencyValues = accounts.reduce((hash, account) => {
              if (!hash[account.currency]) hash[account.currency] = 0;
              hash[account.currency] += account.cash;
              return hash;
            }, {});

            const total = sumOf(
              ...Object.keys(currencyValues).map((currency) =>
                getCurrencyInCAD(moment(), currencyValues[currency], props.currencyCache, currency),
              ),
            );

            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={1} colSpan={4} align="right">
                    <Flex px={2} flexDirection="row" justifyContent="space-evenly">
                      {Object.keys(currencyValues).map((currency) => (
                        <Box px={2}>
                          <Typography.Text strong style={{ color: currencyValues[currency] >= 0 ? 'green' : 'red' }}>
                            {formatMoney(currencyValues[currency])} {currency.toUpperCase()}
                          </Typography.Text>
                        </Box>
                      ))}
                    </Flex>
                  </Table.Summary.Cell>

                  <Table.Summary.Cell index={1} colSpan={1} align="right">
                    <Typography.Text style={{ paddingRight: 8 }}>Total:</Typography.Text>
                    <Typography.Text strong style={{ color: total >= 0 ? 'green' : 'red' }}>
                      {formatMoney(total)} CAD
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
