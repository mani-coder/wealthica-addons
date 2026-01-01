import { Select } from 'antd';

import type { Account, Position } from '../types';
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
    .map((symbol) => (
      <Select.Option key={symbol} value={symbol}>
        {symbol}
      </Select.Option>
    ));

  return (
    <div className="flex py-1 px-4 w-full flex-col space-y-1">
      <div className="text-center text-lg mb-2 font-semibold">Search for a stock:</div>
      <Select
        showSearch={{
          filterOption: (inputValue, option) =>
            ((option?.props?.value as string) ?? '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1,
        }}
        value={selectedSymbol}
        placeholder="Enter a stock, e.g: FB, SHOP.TO"
        className="w-full"
        onChange={(symbol) => setSelectedSymbol(symbol)}
      >
        {options}
      </Select>

      <div className="py-2">
        {selectedSymbol && <StockDetails symbol={selectedSymbol} positions={positions} {...rest} />}
      </div>
    </div>
  );
};
