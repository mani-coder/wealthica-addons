import { Typography } from 'antd';
import type { TextProps } from 'antd/es/typography/Text';
import { Flex, FlexProps } from 'rebass';
import useCurrency from '../hooks/useCurrency';
import { Account, Position } from '../types';
import { formatMoney, getSymbol, sumOf } from '../utils/common';

type Props = {
  symbol: string;
  positions: Position[];
  accounts: Account[];
  isPrivateMode: boolean;
};

function LabelValue({
  label,
  value,
  valueProps,
  ...rest
}: { label: string; value: string; valueProps?: TextProps } & FlexProps) {
  return (
    <Flex justifyContent="space-between" py={1} style={{ borderBottom: `1px solid #f0f0f0` }} {...rest}>
      <Typography.Text strong>{label}</Typography.Text>
      <Typography.Text {...valueProps}>{value}</Typography.Text>
    </Flex>
  );
}

export default function StockDetails(props: Props) {
  const { baseCurrencyDisplay } = useCurrency();
  const marketValue = props.positions.reduce((sum, position) => {
    return sum + position.market_value;
  }, 0);

  const position = props.positions.find((position) => getSymbol(position.security) === props.symbol);
  if (!position) {
    return <></>;
  }

  const accounts = (props.accounts || [])
    .map((account) => {
      const position = account.positions.filter((position) => position.symbol === props.symbol)[0];
      return position
        ? { name: account.name, quantity: position.quantity, price: position.book_value / position.quantity }
        : undefined;
    })
    .filter((value) => value)
    .sort((a, b) => b!.quantity - a!.quantity);

  const currency = position.security.currency ? position.security.currency.toUpperCase() : position.security.currency;
  return (
    <Flex flexDirection="column" p={2}>
      <LabelValue label="Symbol" value={getSymbol(position.security)} />

      <LabelValue
        label="Book Value"
        value={`${baseCurrencyDisplay} ${props.isPrivateMode ? '-' : formatMoney(position.book_value)}`}
      />

      <LabelValue
        label="Market Value"
        value={`${baseCurrencyDisplay} ${
          props.isPrivateMode ? '-' : formatMoney(position.market_value)
        } (${(position.market_value ? (position.market_value / marketValue) * 100 : 0).toFixed(2)}%)`}
      />

      <LabelValue
        label="Proft/Loss"
        value={`${baseCurrencyDisplay} ${
          props.isPrivateMode ? '-' : formatMoney(position.gain_amount)
        } (${(position.gain_percent ? position.gain_percent * 100 : position.gain_percent || 0).toFixed(2)}%)`}
        valueProps={{ type: position.gain_percent > 0 ? 'success' : 'danger', strong: true }}
      />
      <LabelValue
        label="XIRR"
        value={`${(position.xirr ? position.xirr * 100 : position.xirr || 0).toFixed(2)}%`}
        valueProps={{ type: position.xirr > 0 ? 'success' : 'danger', strong: true }}
      />

      <LabelValue label="Shares" value={`${position.quantity}`} />

      <LabelValue label="Currency" value={currency} />
      <LabelValue
        label="Buy Price"
        value={formatMoney(
          sumOf(...position.investments.map((investment) => investment.book_value)) / position.quantity,
        )}
      />
      <LabelValue label="Last Price" value={formatMoney(position.security.last_price)} />
      <LabelValue
        label="Account"
        value="Shares"
        valueProps={{ strong: true }}
        pt={2}
        style={{ borderBottom: `2px solid #7b7b7b` }}
      />
      {accounts.map(
        (account) =>
          account && (
            <LabelValue
              key={account.name}
              label={account.name}
              value={`${account.quantity}@${formatMoney(account.price)}`}
            />
          ),
      )}
    </Flex>
  );
}
