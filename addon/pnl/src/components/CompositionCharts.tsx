import { Switch, Typography } from 'antd';
import * as Highcharts from 'highcharts';
import { useCallback, useMemo, useState } from 'react';
import { isFund } from '@/utils/securityHelpers';
import { trackEvent } from '../analytics';
import { useAddonContext } from '../context/AddonContext';
import useCurrency from '../hooks/useCurrency';
import { useSectorEnrichment } from '../hooks/useSectorEnrichment';
import type { Account, Position } from '../types';
import { getOptions, POSITION_TOOLTIP } from '../utils/chartHelpers';
import { formatCurrency, formatMoney, getSymbol, getYahooSymbol, sumOf } from '../utils/common';
import { type GroupType, getGroupKey } from '../utils/compositionHelpers';
import { startCase } from '../utils/lodash-replacements';
import { Charts } from './Charts';
import Collapsible from './Collapsible';
import CompositionGroup from './CompositionGroup';
import CompositionTable from './CompositionTable';

type Props = {
  positions: Position[];
  accounts: Account[];
};

const COLORS = Highcharts.getOptions().colors;

export default function CompositionCharts(props: Props) {
  const [showHoldings, setShowHoldings] = useState(false);
  const { isPrivateMode } = useAddonContext();
  const { getValue, baseCurrencyDisplay } = useCurrency();
  const [compositionGroup, setCompositionGroup] = useState<GroupType>('currency');

  // Use sector enrichment hook - only fetch data when viewing sector composition
  const { accountsWithSectors: enrichedAccounts, fundSectorWeightings } = useSectorEnrichment(
    props.accounts,
    compositionGroup === 'sector',
  );

  // Use enriched accounts only when viewing sector composition, otherwise use original accounts
  const accountsWithSectors = compositionGroup === 'sector' ? enrichedAccounts : props.accounts;

  const getColor = useCallback((index: number) => (COLORS ? COLORS[index % COLORS?.length] : undefined), []);

  const getAccountsCompositionHoldingsDrilldown = useCallback(
    (group: GroupType, drilldown: boolean): Highcharts.SeriesPieOptions | Highcharts.DrilldownOptions => {
      // Use accountsWithSectors when grouping by sector
      const accounts = group === 'sector' ? accountsWithSectors : props.accounts;

      const accountsByName = accounts.reduce(
        (hash, account) => {
          // For sector grouping, distribute ETFs across sectors based on weightings
          if (group === 'sector') {
            account.positions.forEach((position) => {
              const value = getValue(position.currency, position.market_value);
              const gainAmount = getValue(position.currency, position.gain_amount);

              // Handle crypto positions first
              if (position.type === 'crypto') {
                const name = 'Crypto';
                let mergedAccount = hash[name];
                if (!mergedAccount) {
                  mergedAccount = { name, value: 0, positions: {}, accounts: [] };
                  hash[name] = mergedAccount;
                }
                mergedAccount.value += value;

                const symbol = getSymbol(position.security);
                const existingPosition = mergedAccount.positions[symbol];
                if (!existingPosition) {
                  mergedAccount.positions[symbol] = {
                    ...position,
                    market_value: value,
                    gain_amount: gainAmount,
                  };
                } else {
                  const newValue = existingPosition.market_value + value;
                  const newGainAmount = existingPosition.gain_amount + gainAmount;

                  mergedAccount.positions[symbol] = {
                    ...existingPosition,
                    book_value: existingPosition.book_value + position.book_value,
                    market_value: newValue,
                    quantity: existingPosition.quantity + position.quantity,
                    gain_currency_amount: existingPosition.gain_currency_amount + position.gain_currency_amount,
                    gain_amount: newGainAmount,
                    gain_percent: newGainAmount / (newValue - newGainAmount),
                  };
                }

                if (!mergedAccount.accounts.includes(account)) {
                  mergedAccount.accounts.push(account);
                }
                return;
              }

              const yahooSymbol = getYahooSymbol(position.security);
              const fundWeighting = fundSectorWeightings.get(yahooSymbol);

              if (isFund(position) && fundWeighting && Object.keys(fundWeighting).length > 0) {
                // Distribute fund (ETF/mutual fund) across sectors based on weightings
                Object.entries(fundWeighting).forEach(([sectorName, weight]) => {
                  const sectorValue = value * weight;
                  const sectorGainAmount = gainAmount * weight;

                  let mergedAccount = hash[sectorName];
                  if (!mergedAccount) {
                    mergedAccount = { name: sectorName, value: 0, positions: {}, accounts: [] };
                    hash[sectorName] = mergedAccount;
                  }
                  mergedAccount.value += sectorValue;

                  const symbol = getSymbol(position.security);
                  const existingPosition = mergedAccount.positions[symbol];
                  if (!existingPosition) {
                    mergedAccount.positions[symbol] = {
                      ...position,
                      market_value: sectorValue,
                      gain_amount: sectorGainAmount,
                    };
                  } else {
                    const newValue = existingPosition.market_value + sectorValue;
                    const newGainAmount = existingPosition.gain_amount + sectorGainAmount;

                    mergedAccount.positions[symbol] = {
                      ...existingPosition,
                      book_value: existingPosition.book_value + position.book_value * weight,
                      market_value: newValue,
                      quantity: existingPosition.quantity + position.quantity * weight,
                      gain_currency_amount:
                        existingPosition.gain_currency_amount + position.gain_currency_amount * weight,
                      gain_amount: newGainAmount,
                      gain_percent: newGainAmount / (newValue - newGainAmount),
                    };
                  }

                  if (!mergedAccount.accounts.includes(account)) {
                    mergedAccount.accounts.push(account);
                  }
                });
              } else {
                // Regular stock - use direct sector assignment
                const name = getGroupKey(group, account, position);
                let mergedAccount = hash[name];
                if (!mergedAccount) {
                  mergedAccount = { name, value: 0, positions: {}, accounts: [] };
                  hash[name] = mergedAccount;
                }
                mergedAccount.value += value;

                const symbol = getSymbol(position.security);
                const existingPosition = mergedAccount.positions[symbol];
                if (!existingPosition) {
                  mergedAccount.positions[symbol] = {
                    ...position,
                    market_value: value,
                    gain_amount: gainAmount,
                  };
                } else {
                  const newValue = existingPosition.market_value + value;
                  const newGainAmount = existingPosition.gain_amount + gainAmount;

                  mergedAccount.positions[symbol] = {
                    ...existingPosition,
                    book_value: existingPosition.book_value + position.book_value,
                    market_value: newValue,
                    quantity: existingPosition.quantity + position.quantity,
                    gain_currency_amount: existingPosition.gain_currency_amount + position.gain_currency_amount,
                    gain_amount: newGainAmount,
                    gain_percent: newGainAmount / (newValue - newGainAmount),
                  };
                }

                if (!mergedAccount.accounts.includes(account)) {
                  mergedAccount.accounts.push(account);
                }
              }
            });
          } else {
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
          }

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
                return position
                  ? {
                      name: account.name,
                      quantity: position.quantity,
                      price: formatMoney(position.book_value / position.quantity),
                    }
                  : undefined;
              })
              .filter((value): value is { name: string; quantity: number; price: string } => !!value)
              .sort((a, b) => b.quantity - a.quantity)
              .map(
                (value) =>
                  `<tr><td>${value.name}</td><td style="text-align: right;">${value.quantity}@${value.price}</td></tr>`,
              )
              .join('');

            const brightness = 0.2 - idx / numPositions / 5;
            const color = getColor(index);

            return {
              color: color && showHoldings ? Highcharts.color(color).brighten(brightness).get() : undefined,
              name: symbol,
              y: position.market_value,
              baseCurrency: baseCurrencyDisplay,
              displayValue: isPrivateMode ? '-' : formatCurrency(position.market_value, 1),
              value: isPrivateMode ? '-' : formatMoney(position.market_value),
              gain: position.gain_percent ? position.gain_percent * 100 : position.gain_percent,
              profit: isPrivateMode ? '-' : formatMoney(position.gain_amount),
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
              type: 'pie' as const,
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
            type: 'pie' as const,
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
    [
      baseCurrencyDisplay,
      getColor,
      props.accounts,
      isPrivateMode,
      showHoldings,
      getValue,
      accountsWithSectors,
      fundSectorWeightings,
    ],
  );

  const getAccountsCompositionSeries = useCallback(
    (group: GroupType): Highcharts.SeriesPieOptions[] => {
      // Use accountsWithSectors when grouping by sector
      const accounts = group === 'sector' ? accountsWithSectors : props.accounts;
      const totalValue = accounts.reduce((value, account) => value + account.value, 0);

      const data = Object.values(
        accounts.reduce(
          (hash, account) => {
            // For sector grouping, distribute ETFs across sectors based on weightings
            if (group === 'sector') {
              account.positions.forEach((position) => {
                const value = getValue(position.currency, position.market_value);
                const gainAmount = getValue(position.currency, position.gain_amount);

                // Handle crypto positions first
                if (position.type === 'crypto') {
                  const name = 'Crypto';
                  let mergedAccount = hash[name];
                  if (!mergedAccount) {
                    mergedAccount = { name, value: 0, gainAmount: 0, accounts: {} };
                    hash[name] = mergedAccount;
                  }
                  mergedAccount.value += value;
                  mergedAccount.gainAmount += gainAmount;

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
                  return;
                }

                const yahooSymbol = getYahooSymbol(position.security);
                const fundWeighting = fundSectorWeightings.get(yahooSymbol);

                if (isFund(position) && fundWeighting && Object.keys(fundWeighting).length > 0) {
                  // Distribute fund (ETF/mutual fund) across sectors based on weightings
                  Object.entries(fundWeighting).forEach(([sectorName, weight]) => {
                    const sectorValue = value * weight;
                    const sectorGainAmount = gainAmount * weight;

                    let mergedAccount = hash[sectorName];
                    if (!mergedAccount) {
                      mergedAccount = { name: sectorName, value: 0, gainAmount: 0, accounts: {} };
                      hash[sectorName] = mergedAccount;
                    }
                    mergedAccount.value += sectorValue;
                    mergedAccount.gainAmount += sectorGainAmount;

                    const _name = account.name;
                    let _account = mergedAccount.accounts[_name];
                    if (!_account) {
                      _account = { name: _name, currencyValues: {}, value: 0 };
                      mergedAccount.accounts[_name] = _account;
                    }
                    const cash = account.cash ? Number((account.cash * weight).toFixed(2)) : 0;

                    if (!_account.currencyValues[account.currency]) {
                      _account.currencyValues[account.currency] = 0;
                    }
                    _account.currencyValues[account.currency] += cash;
                  });
                } else {
                  // Regular stock - use direct sector assignment
                  const name = getGroupKey(group, account, position);
                  let mergedAccount = hash[name];
                  if (!mergedAccount) {
                    mergedAccount = { name, value: 0, gainAmount: 0, accounts: {} };
                    hash[name] = mergedAccount;
                  }
                  mergedAccount.value += value;
                  mergedAccount.gainAmount += gainAmount;

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
                }
              });
            } else {
              const name = getGroupKey(group, account);
              let mergedAccount = hash[name];
              if (!mergedAccount) {
                mergedAccount = { name, value: 0, gainAmount: 0, accounts: {} };
                hash[name] = mergedAccount;
              }
              // Use account.value which already includes positions + cash
              mergedAccount.value += account.value;
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
            }

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
        type: 'pie' as const,
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
              displayValue: isPrivateMode ? '-' : account.value ? formatMoney(account.value) : account.value,
              totalValue: isPrivateMode ? '-' : formatMoney(totalValue),
              gain: isPrivateMode ? '-' : `${baseCurrencyDisplay} ${formatMoney(account.gainAmount)}`,
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
                color: '#065f46',
                fontSize: '12px',
                fontWeight: '800',
                textOutline: '2px #ffffff',
                textDecoration: 'underline',
              }
            : {
                color: '#10b981',
                fontSize: '12px',
                fontWeight: '700',
              },
          distance: showHoldings ? 150 : 50,
        },
        tooltip: {
          headerFormat: '<b>{point.key}<br />{point.percentage:.1f}%</b><hr />',
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
            !!point.cash && !isPrivateMode
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
      isPrivateMode,
      showHoldings,
      getAccountsCompositionHoldingsDrilldown,
      getValue,
      getColor,
      baseCurrencyDisplay,
      accountsWithSectors,
      fundSectorWeightings,
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
      isPrivateMode,
    });
  }, [getCompositionGroupSeriesOptions, compositionGroup, showHoldings, isPrivateMode]);

  const tableData = useMemo(() => {
    const accounts = compositionGroup === 'sector' ? accountsWithSectors : props.accounts;

    const data = Object.values(
      accounts.reduce(
        (hash, account) => {
          if (compositionGroup === 'sector') {
            account.positions.forEach((position) => {
              const value = getValue(position.currency, position.market_value);

              // Handle crypto positions first
              if (position.type === 'crypto') {
                const name = 'Crypto';
                let mergedAccount = hash[name];
                if (!mergedAccount) {
                  mergedAccount = { name, value: 0 };
                  hash[name] = mergedAccount;
                }
                mergedAccount.value += value;
                return;
              }

              const yahooSymbol = getYahooSymbol(position.security);
              const fundWeighting = fundSectorWeightings.get(yahooSymbol);

              if (isFund(position) && fundWeighting && Object.keys(fundWeighting).length > 0) {
                // Distribute fund across sectors
                Object.entries(fundWeighting).forEach(([sectorName, weight]) => {
                  const sectorValue = value * weight;

                  let mergedAccount = hash[sectorName];
                  if (!mergedAccount) {
                    mergedAccount = { name: sectorName, value: 0 };
                    hash[sectorName] = mergedAccount;
                  }
                  mergedAccount.value += sectorValue;
                });
              } else {
                // Regular stock
                const name = getGroupKey(compositionGroup, account, position);
                let mergedAccount = hash[name];
                if (!mergedAccount) {
                  mergedAccount = { name, value: 0 };
                  hash[name] = mergedAccount;
                }
                mergedAccount.value += value;
              }
            });
          } else {
            const name = getGroupKey(compositionGroup, account);
            let mergedAccount = hash[name];
            if (!mergedAccount) {
              mergedAccount = {
                name,
                value: 0,
                accountId: compositionGroup === 'accounts' ? account.id.split(':')[0] : undefined,
              };
              hash[name] = mergedAccount;
            }
            // Use account.value which already includes positions + cash
            mergedAccount.value += account.value;
          }

          return hash;
        },
        {} as { [K: string]: { name: string; value: number; accountId?: string } },
      ),
    );

    return data
      .filter((item) => item.value)
      .sort((a, b) => b.value - a.value)
      .map((item, index) => {
        const color = getColor(index);
        return {
          name: item.name,
          value: item.value,
          accountId: item.accountId,
          color: typeof color === 'string' ? color : undefined,
        };
      });
  }, [compositionGroup, props.accounts, accountsWithSectors, getValue, fundSectorWeightings, getColor]);

  const totalValue = useMemo(() => {
    const accounts = compositionGroup === 'sector' ? accountsWithSectors : props.accounts;
    return accounts.reduce((value, account) => value + account.value, 0);
  }, [compositionGroup, accountsWithSectors, props.accounts]);

  return (
    <Collapsible title="Holdings Composition">
      <div className="p-2" />
      <div className="flex flex-wrap gap-6 mx-4 sm:justify-between justify-center items-end">
        <div className="flex-1">
          <Charts key={compositionGroup} options={compositionGroupOptions} />
        </div>
        {compositionGroup !== 'sector' && (
          <div className="flex-0">
            <CompositionTable
              data={tableData}
              baseCurrency={baseCurrencyDisplay}
              totalValue={totalValue}
              groupType={compositionGroup}
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        <CompositionGroup
          changeGroup={setCompositionGroup}
          group={compositionGroup}
          tracker="holdings-composition-group"
        />
      </div>

      <div className="flex my-3 w-full justify-center items-center">
        <Switch
          checked={showHoldings}
          onChange={(checked) => {
            setShowHoldings(checked);
            trackEvent('composition-group-show-holdings', { checked });
          }}
        />

        <div className="px-2 mb-2" />
        <Typography.Text strong>Show Holdings (Donut Chart)</Typography.Text>
      </div>
    </Collapsible>
  );
}
