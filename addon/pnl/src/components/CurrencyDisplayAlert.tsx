import { Alert } from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { Flex } from 'rebass';
import { trackEvent } from '../analytics';
import { CURRENCY_DISPLAY_CACHE_KEY, DATE_FORMAT } from '../constants';
import useCurrency from '../hooks/useCurrency';
import { formatDate, getLocalCache, setLocalCache } from '../utils/common';

export default function CurrencyDisplayAlert({ currency }: { currency: string }) {
  const { baseCurrencyDisplay } = useCurrency();

  const displayCurrencyAlert = useMemo(() => {
    const currencyDisplayCache = getLocalCache(CURRENCY_DISPLAY_CACHE_KEY);
    if (!currencyDisplayCache) {
      return true;
    }

    try {
      const data = JSON.parse(currencyDisplayCache);
      const date = dayjs(data['date']);
      const _currency = data['currency'] as string;
      // If the currency has changed or the alert has expired
      console.log('mani is cool', { data, currency });

      return _currency !== currency || date.add(60, 'days').isBefore(dayjs());
    } catch (error) {
      return true;
    }
  }, [currency]);

  function saveCurrencyDisplayInLocalCache() {
    setLocalCache(CURRENCY_DISPLAY_CACHE_KEY, JSON.stringify({ date: formatDate(dayjs(), DATE_FORMAT), currency }));
  }

  return displayCurrencyAlert ? (
    <Flex width={1} justifyContent="center" alignItems="center" marginY={1}>
      <Alert
        style={{ width: '100%', textAlign: 'center' }}
        type="info"
        banner
        closable
        onClose={() => {
          saveCurrencyDisplayInLocalCache();
          trackEvent('close_currency_alert', { currency });
        }}
        message={
          <>
            All amounts are displayed in <b>{baseCurrencyDisplay}</b>, as per your currency preference.
          </>
        }
      />
    </Flex>
  ) : (
    <></>
  );
}
