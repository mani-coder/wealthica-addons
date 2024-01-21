import { useContext } from 'react';

import CurrencyContext from '../context/CurrencyContext';

export const useCurrency = () => useContext(CurrencyContext);

export default useCurrency;
