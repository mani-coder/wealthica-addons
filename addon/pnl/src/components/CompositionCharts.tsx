import { Switch, Typography } from 'antd';
import * as Highcharts from 'highcharts';
import { startCase } from 'lodash';
import { useCallback, useMemo, useState } from 'react';
import { Box, Flex } from 'rebass';
import { trackEvent } from '../analytics';
import useCurrency from '../hooks/useCurrency';
import { Account, Position } from '../types';
import { formatCurrency, formatMoney, getSymbol, sumOf } from '../utils/common';
import { Charts } from './Charts';
import Collapsible from './Collapsible';
import CompositionGroup, { GroupType, getGroupKey } from './CompositionGroup';
import { POSITION_TOOLTIP, getOptions } from './HoldingsChartsBase';

type Props = {
  positions: Position[];
  accounts: Account[];
  isPrivateMode: boolean;
  addon?: any;
};

const COLORS = Highcharts.getOptions().colors;

export default function CompositionCharts(props: Props) {
  const [showHoldings, setShowHoldings] = useState(true);
  const { getValue, baseCurrencyDisplay } = useCurrency();
  const [compositionGroup, setCompositionGroup] = useState<GroupType>('currency');

  const getColor = useCallback((index) => (COLORS ? COLORS[index % COLORS?.length] : undefined), []);

  const getAccountsCompositionHoldingsDrilldown = useCallback(
    (group: GroupType, drilldown: boolean): Highcharts.SeriesPieOptions | Highcharts.DrilldownOptions => {
      const accountsByName = props.accounts.reduce(
        (hash, account) => {
          const name = getGroupKey(group, account);
          let mergedAccount = hash[name];
          if (!mergedAccount) {
            mergedAccount = { name, value: 0, positions: {}, accounts: [] };
            hash[name] = mergedAccount;
          }
          mergedAccount.value += sumOf(
            ...account.positions.map((position) => getValue(position.currency, position.market_value)),
          );

          account.positions.forEach((position) => {
            const symbol = getSymbol(position.security);
            const existingPosition = mergedAccount.positions[symbol];
            if (!existingPosition) {
              mergedAccount.positions[symbol] = {
                ...position,
                market_value: getValue(position.currency, position.market_value),
                gain_amount: getValue(position.currency, position.gain_amount),
              };
            } else {
              const value = existingPosition.market_value + getValue(position.currency, position.market_value);
              const gain_amount = existingPosition.gain_amount + getValue(position.currency, position.gain_amount);

              mergedAccount.positions[symbol] = {
                ...existingPosition,
                book_value: existingPosition.book_value + position.book_value,
                market_value: value,
                quantity: existingPosition.quantity + position.quantity,
                gain_currency_amount: existingPosition.gain_currency_amount + position.gain_currency_amount,
                gain_amount,
                gain_percent: gain_amount / (value - gain_amount),
              };
            }
          });

          mergedAccount.accounts.push(account);

          return hash;
        },
        {} as {
          [K: string]: {
            name: string;
            value: number;
            positions: { [K: string]: Position };
            accounts: Account[];
          };
        },
      );

      const getDataForAccount = (name: string, index: number) => {
        const account = accountsByName[name];
        const positions = Object.values(account.positions);
        const numPositions = positions.length;

        const data = positions
          .sort((a, b) => b.market_value - a.market_value)
          .map((position, idx) => {
            const symbol = getSymbol(position.security);
            const accountsTable = account.accounts
              .map((account) => {
                const position = account.positions.filter((position) => position.symbol === symbol)[0];
                return position ? { name: account.name, quantity: position.quantity } : undefined;
              })
              .filter((value) => value)
              .sort((a, b) => b!.quantity - a!.quantity)
              .map((value) => `<tr><td>${value!.name}</td><td style="text-align: right;">${value!.quantity}</td></tr>`)
              .join('');

            const brightness = 0.2 - idx / numPositions / 5;
            const color = getColor(index);

            return {
              color: color && showHoldings ? Highcharts.color(color).brighten(brightness).get() : undefined,
              name: symbol,
              y: position.market_value,
              baseCurrency: baseCurrencyDisplay,
              displayValue: props.isPrivateMode ? '-' : formatCurrency(position.market_value, 1),
              value: props.isPrivateMode ? '-' : formatMoney(position.market_value),
              gain: position.gain_percent ? position.gain_percent * 100 : position.gain_percent,
              profit: props.isPrivateMode ? '-' : formatMoney(position.gain_amount),
              buyPrice: formatMoney(position.book_value / position.quantity),
              shares: position.quantity,
              lastPrice: formatMoney(position.security.last_price),
              currency: position.security.currency
                ? position.security.currency.toUpperCase()
                : position.security.currency,
              pnlColor: position.gain_amount >= 0 ? 'green' : 'red',
              accountsTable,
            };
          }) as any;

        return drilldown
          ? {
              type: 'pie' as 'pie',
              id: name,
              name,
              data,
              tooltip: POSITION_TOOLTIP,
              dataLabels: {
                enabled: true,
                format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                style: {
                  color: 'black',
                },
              },
            }
          : data;
      };

      return drilldown
        ? {
            activeAxisLabelStyle: {
              textDecoration: 'none',
            },
            activeDataLabelStyle: {
              textDecoration: 'none',
            },

            series: Object.keys(accountsByName).map(
              (name, index) => getDataForAccount(name, index) as Highcharts.SeriesPieOptions,
            ),
          }
        : {
            type: 'pie' as 'pie',
            id: 'holdings',
            name: 'Holdings',
            size: '80%',
            innerSize: '60%',
            dataLabels: {
              formatter() {
                const point = this.point;
                return this.percentage && this.percentage > 2.5
                  ? `${point.name}: ${this.percentage.toFixed(1)}%`
                  : null;
              },
            },
            data: Object.keys(accountsByName)
              .sort((a, b) => accountsByName[b].value - accountsByName[a].value)
              .reduce((array, name, index) => {
                array.push(...(getDataForAccount(name, index) as any));
                return array;
              }, [] as any[]),
            tooltip: POSITION_TOOLTIP,
          };
    },
    [baseCurrencyDisplay, getColor, props.accounts, props.isPrivateMode, showHoldings, getValue],
  );

  const getAccountsCompositionSeries = useCallback(
    (group: GroupType): Highcharts.SeriesPieOptions[] => {
      const totalValue = props.accounts.reduce((value, account) => value + account.value, 0);
      const data = Object.values(
        props.accounts.reduce(
          (hash, account) => {
            const name = getGroupKey(group, account);
            let mergedAccount = hash[name];
            if (!mergedAccount) {
              mergedAccount = { name, value: 0, gainAmount: 0, accounts: {} };
              hash[name] = mergedAccount;
            }
            mergedAccount.value += sumOf(
              ...account.positions.map((position) => getValue(position.currency, position.market_value)),
            );
            mergedAccount.gainAmount += sumOf(
              ...account.positions.map((position) => getValue(position.currency, position.gain_amount)),
            );

            const _name = account.name;
            let _account = mergedAccount.accounts[_name];
            if (!_account) {
              _account = { name: _name, currencyValues: {}, value: 0 };
              mergedAccount.accounts[_name] = _account;
            }
            const cash = account.cash ? Number(account.cash.toFixed(2)) : 0;

            if (!_account.currencyValues[account.currency]) {
              _account.currencyValues[account.currency] = 0;
            }
            _account.currencyValues[account.currency] += cash;

            return hash;
          },
          {} as {
            [K: string]: {
              name: string;
              value: number;
              gainAmount: number;
              accounts: { [K: string]: { name: string; value: number; currencyValues: { [K: string]: number } } };
            };
          },
        ),
      );

      const accountsSeries: Highcharts.SeriesPieOptions = {
        type: 'pie' as 'pie',
        id: 'accounts',
        name: 'Accounts',
        size: showHoldings ? '60%' : '100%',
        data: data
          .filter((account) => account.value)
          .sort((a, b) => b.value - a.value)
          .map((account, index) => {
            const accounts = Object.values(account.accounts);
            const cash = sumOf(
              ...accounts.map((account) =>
                sumOf(
                  ...Object.keys(account.currencyValues).map((currency) =>
                    getValue(currency, account.currencyValues[currency]),
                  ),
                ),
              ),
            );
            const cashTable = accounts
              .filter((account) => !!sumOf(...Object.values(account.currencyValues)))
              .map(
                (account) =>
                  `<tr>
                <td style="vertical-align: top">${account.name}</td>
                <td style="text-align: right;">
                ${Object.keys(account.currencyValues)
                  .filter((currency) => !!account.currencyValues[currency])
                  .map((currency) => {
                    return `<div style="color:${
                      account.currencyValues[currency] < 0 ? 'red' : ''
                    }">${currency.toUpperCase()} ${formatMoney(account.currencyValues[currency])}</div>`;
                  })
                  .join('')}
                </td>
              </tr>`,
              )
              .join('');

            return {
              color: getColor(index),
              name: account.name,
              drilldown: showHoldings ? undefined : account.name,
              y: account.value,
              baseCurrency: baseCurrencyDisplay,
              displayValue: props.isPrivateMode ? '-' : account.value ? formatMoney(account.value) : account.value,
              totalValue: props.isPrivateMode ? '-' : formatMoney(totalValue),
              gain: props.isPrivateMode ? '-' : `${baseCurrencyDisplay} ${formatMoney(account.gainAmount)}`,
              gainRatio: `${((account.gainAmount / (account.value - account.gainAmount)) * 100).toFixed(2)}%`,
              pnlColor: account.gainAmount >= 0 ? 'green' : 'red',
              cash,
              cashTable,
            };
          }),
        dataLabels: {
          formatter() {
            return this.percentage && this.percentage > (showHoldings ? 2 : 0)
              ? `${this.point.name}: ${this.percentage.toFixed(1)}%`
              : null;
          },
          style: showHoldings
            ? {
                color: 'purple',
                fontSize: '12px',
                fontWeight: '600',
              }
            : {},
          distance: showHoldings ? 150 : 50,
        },
        tooltip: {
          headerFormat: `<b>{point.key}<br />{point.percentage:.1f}%</b><hr />`,
          pointFormatter() {
            const point = this.options as any;
            return `<table>
          <tr><td>Value</td><td style="text-align: right;" class="position-tooltip-value">${point.baseCurrency} ${
              point.displayValue
            }</td></tr>
          <tr><td>Total Value</td><td style="text-align: right;" class="position-tooltip-value">${point.baseCurrency} ${
              point.totalValue
            }</td></tr>
          <tr><td>Unrealized P/L ($) </td><td style="text-align: right;" style="color:${
            point.pnlColor
          };" class="position-tooltip-value">${point.gain}</td></tr>
          <tr><td>Unrealized P/L (%)</td><td style="text-align: right;" style="color:${
            point.pnlColor
          };" class="position-tooltip-value">${point.gainRatio}</td></tr>
          ${
            point.cashTable
              ? `<tr><td colspan="2"><hr /></td></tr>
              <tr><td style="font-weight: 600">Account</td><td style="text-align: right;" style="font-weight: 600">Cash</td></tr>${point.cashTable}`
              : ''
          }
          <tr><td colspan="2"><hr /></td></tr>
          ${
            !!point.cash && !props.isPrivateMode
              ? `<tr><td>Total Cash</td><td style="text-align: right;" class="position-tooltip-cash" style="color:${
                  point.cash < 0 ? 'red' : ''
                };">${point.baseCurrency} ${formatMoney(point.cash)}</td></tr>`
              : ''
          }
        </table>`;
          },
        },
      };

      return showHoldings
        ? [accountsSeries, getAccountsCompositionHoldingsDrilldown(group, false) as Highcharts.SeriesPieOptions]
        : [accountsSeries];
    },
    [
      props.accounts,
      props.isPrivateMode,
      showHoldings,
      getAccountsCompositionHoldingsDrilldown,
      getValue,
      getColor,
      baseCurrencyDisplay,
    ],
  );

  const getCompositionGroupSeriesOptions = useCallback(
    (
      group: GroupType,
    ): {
      series: Highcharts.SeriesPieOptions[];
      drilldown?: Highcharts.DrilldownOptions;
      title: string;
    } => {
      const series = getAccountsCompositionSeries(group);
      const drilldown = showHoldings ? undefined : getAccountsCompositionHoldingsDrilldown(group, true);
      const title = group === 'type' ? 'Account Type' : `${startCase(group)}`;

      return { series, drilldown, title: `${title} Composition` };
    },
    [showHoldings, getAccountsCompositionSeries, getAccountsCompositionHoldingsDrilldown],
  );

  const compositionGroupOptions = useMemo(() => {
    const { series, drilldown, title } = getCompositionGroupSeriesOptions(compositionGroup);
    return getOptions({
      title,
      subtitle: showHoldings ? undefined : '(click on the category name to drill into the holdings.)',
      series,
      drilldown,
      isPrivateMode: props.isPrivateMode,
    });
  }, [getCompositionGroupSeriesOptions, compositionGroup, showHoldings, props.isPrivateMode]);

  return (
    <Collapsible title="Holdings Composition">
      <Charts key={compositionGroup} options={compositionGroupOptions} />
      <CompositionGroup
        changeGroup={setCompositionGroup}
        group={compositionGroup}
        tracker="holdings-composition-group"
      />

      <Flex mt={3} mb={2} width={1} justifyContent="center" alignItems="center" alignContent="center">
        <Switch
          checked={showHoldings}
          onChange={(checked) => {
            setShowHoldings(checked);
            trackEvent('composition-group-show-holdings', { checked });
          }}
        />

        <Box px={1} />
        <Typography.Text strong style={{ fontSize: 16 }}>
          Show Holdings (Donut Chart)
        </Typography.Text>
      </Flex>
    </Collapsible>
  );
}
