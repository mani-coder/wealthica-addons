import { Select, Typography } from 'antd';

import { Account, Position } from '../types';
import { getSymbol } from '../utils/common';
import StockDetails from './StockDetails';

type StockSelectorProps = {
  positions: Position[];
  accounts: Account[];
  isPrivateMode: boolean;
  selectedSymbol?: string;
  setSelectedSymbol: (symbol: string) => void;
};
export const StockSelector = ({ positions, selectedSymbol, setSelectedSymbol, ...rest }: StockSelectorProps) => {
  const options = positions
    .map((position) => getSymbol(position.security))
    .sort()
    .map((symbol, index) => (
      <Select.Option key={index} value={symbol}>
        {symbol}
      </Select.Option>
    ));

  return (
    <div className="flex p-6 w-full flex-col">
      <Typography.Title style={{ textAlign: 'center' }} level={4}>
        Search for a stock:
      </Typography.Title>
      <Select
        showSearch
        value={selectedSymbol}
        placeholder="Enter a stock, e.g: FB, SHOP.TO"
        className="w-full"
        onChange={(symbol) => setSelectedSymbol(symbol)}
        filterOption={(inputValue, option) =>
          (option!.props!.value! as string).toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
        }
      >
        {options}
      </Select>

      {selectedSymbol && <StockDetails symbol={selectedSymbol} positions={positions} {...rest} />}
    </div>
  );
};
