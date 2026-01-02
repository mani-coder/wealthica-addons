import { Alert } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { trackEvent } from '../analytics';
import { CURRENCY_DISPLAY_CACHE_KEY, DATE_FORMAT } from '../constants';
import useCurrency from '../hooks/useCurrency';
import { formatDate, getLocalCache, setLocalCache } from '../utils/common';

export default function CurrencyDisplayAlert({ currency }: { currency: string }) {
  const { baseCurrencyDisplay } = useCurrency();
  const [isDisplaying, setIsDisplaying] = useState(() => {
    const currencyDisplayCache = getLocalCache(CURRENCY_DISPLAY_CACHE_KEY);
    if (!currencyDisplayCache) {
      return true;
    }

    try {
      const data = JSON.parse(currencyDisplayCache);
      const date = dayjs(data.date);
      const _currency = data.currency as string;

      // If the currency has changed or the alert has expired
      return _currency !== currency || date.add(60, 'days').isBefore(dayjs());
    } catch {
      return true;
    }
  });

  function saveCurrencyDisplayInLocalCache() {
    setIsDisplaying(false);
    setLocalCache(CURRENCY_DISPLAY_CACHE_KEY, JSON.stringify({ date: formatDate(dayjs(), DATE_FORMAT), currency }));
  }

  function onClose() {
    saveCurrencyDisplayInLocalCache();
    trackEvent('close_currency_alert', { currency });
  }

  return isDisplaying ? (
    <div className="flex w-full justify-center items-center my-2 mb-2">
      <Alert
        className="w-full text-center rounded-lg"
        type="info"
        banner
        closable={{ onClose }}
        title={
          <>
            All amounts are displayed in <b>{baseCurrencyDisplay}</b>, as per your currency preference.
          </>
        }
      />
    </div>
  ) : null;
}
