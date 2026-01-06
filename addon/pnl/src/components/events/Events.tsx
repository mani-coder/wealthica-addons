import LeftOutlined from '@ant-design/icons/LeftOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import { Button, Calendar, Spin, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { trackEvent } from '../../analytics';
import { DATE_FORMAT } from '../../constants';
import type { Position } from '../../types';
import { getSymbolFromNasdaqTicker } from '../../utils/common';
import DividendsTable from './DividendsTable';
import EarningsTable from './EarningsTable';
import type { Dividend, EventType } from './types';
import { usePortfolioEvents } from './usePortfolioEvents';

function EventTypes({ types, onChange }: { types: EventType[]; onChange: (types: EventType[]) => void }) {
  function renderTag(type: EventType, color: string, title: string) {
    const isSelected = types.includes(type);
    return (
      <Tag
        style={{ cursor: 'pointer' }}
        color={isSelected ? color : undefined}
        variant={isSelected ? 'solid' : 'outlined'}
        onClick={() => {
          onChange(isSelected ? types.filter((_type) => _type !== type) : types.concat([type]));
        }}
      >
        {title}
      </Tag>
    );
  }
  return (
    <div className="flex flex-wrap justify-center space-x-2">
      {renderTag('earning', 'magenta', 'Earning')}
      {renderTag('ex-dividend', 'blue', 'ED: Ex-Dividend')}
      {renderTag('pay-dividend', 'green', 'PD: Pay Dividend')}
      {renderTag('rec-dividend', 'geekblue', 'RD: Record Dividend')}
    </div>
  );
}

export default function Events({ positions }: { positions: Position[] }) {
  const [date, setDate] = useState<Dayjs>(dayjs().startOf('month'));
  const range = useMemo(() => {
    return { start: dayjs().startOf('month').subtract(1, 'month'), end: dayjs().endOf('month').add(1, 'year') };
  }, []);
  const [types, setTypes] = useState<EventType[]>(['earning', 'ex-dividend', 'pay-dividend', 'rec-dividend']);
  const { startDate, endDate, dividends, earnings, loading, fetchPortfolioEvents } = usePortfolioEvents(positions);

  useEffect(() => {
    fetchPortfolioEvents(date, date.clone().endOf('month').add(60, 'days'));
  }, [date, fetchPortfolioEvents]);

  const eventsByDate = useMemo(() => {
    let result: {
      [K: string]: {
        ticker: string;
        name: string;
        type: EventType;
        estimatedIncome?: number;
      }[];
    } = {};

    if (types.includes('earning')) {
      result = earnings.reduce((hash: { [key: string]: any }, earning) => {
        const earningDate = dayjs(earning.date).format(DATE_FORMAT);
        let earningsArr = hash[earningDate];
        if (!earningsArr) {
          earningsArr = [];
          hash[earningDate] = earningsArr;
        }
        earningsArr.push({
          ticker: getSymbolFromNasdaqTicker(earning.ticker),
          name: earning.company,
          type: 'earning',
        });
        return hash;
      }, result);
    }

    result = dividends.reduce((hash: { [key: string]: any }, dividend: Dividend) => {
      ['exDate', 'payDate', 'recDate'].forEach((field) => {
        if (!dividend[field as keyof Dividend]) {
          return;
        }
        const type = field === 'exDate' ? 'ex-dividend' : field === 'payDate' ? 'pay-dividend' : 'rec-dividend';
        if (!types.includes(type)) {
          return;
        }

        const dividendDate = dayjs(dividend[field as keyof Dividend] as string).format(DATE_FORMAT);
        let dividendsArr = hash[dividendDate];
        if (!dividendsArr) {
          dividendsArr = [];
          hash[dividendDate] = dividendsArr;
        }
        dividendsArr.push({
          ticker: getSymbolFromNasdaqTicker(dividend.ticker),
          name: dividend.company,
          type,
          estimatedIncome: type === 'pay-dividend' ? dividend.estimatedIncome : undefined,
        });
      });
      return hash;
    }, result);

    return result;
  }, [dividends, earnings, types]);

  function dateCellRender(date: Dayjs) {
    const _events = eventsByDate[date.format(DATE_FORMAT)];

    return _events?.length ? (
      <div className="flex flex-col gap-1">
        {_events.map((item, index) => {
          // For calendar view, only show ticker for earnings and pay dividends with income
          const showInCalendar =
            item.type === 'earning' ||
            (item.type === 'pay-dividend' && item.estimatedIncome && item.estimatedIncome > 0);

          if (!showInCalendar) {
            return null;
          }

          return (
            <div key={`${item.ticker}-${item.type}-${index}`}>
              <Tag color={item.type === 'earning' ? 'magenta' : 'green'} className="text-xs px-2 py-1">
                {item.type === 'earning' ? (
                  item.ticker
                ) : (
                  <>
                    {item.ticker}: ${item.estimatedIncome?.toFixed(0)}
                  </>
                )}
              </Tag>
            </div>
          );
        })}
      </div>
    ) : null;
  }

  return (
    <>
      <div className="text-2xl font-bold text-center my-2">Earnings &amp; Dividends</div>
      <Calendar
        value={date}
        onSelect={(newDate) => {
          const startOfMonth = newDate.startOf('month');
          if (!date.isSame(startOfMonth)) {
            setDate(startOfMonth);
          }
        }}
        validRange={[dayjs().startOf('month'), dayjs().endOf('month').add(1, 'year')]}
        cellRender={dateCellRender}
        headerRender={() => (
          <div className="flex flex-col gap-2 my-4 justify-center">
            <div className="flex justify-between items-center flex-wrap">
              <Button
                loading={loading}
                disabled={date.isSameOrBefore(range.start)}
                type="primary"
                icon={<LeftOutlined />}
                onClick={() => {
                  setDate(date.subtract(1, 'month').clone());
                  trackEvent('event-calendar-action', { action: 'previous' });
                }}
              >
                Prev Month
              </Button>
              <div className="text-xl font-semibold">
                {date.format('MMMM YYYY')} {loading && <Spin size="small" />}
              </div>
              <Button
                loading={loading}
                disabled={date.clone().endOf('month').isSameOrAfter(range.end)}
                type="primary"
                onClick={() => {
                  trackEvent('event-calendar-action', { action: 'next' });
                  setDate(date.add(1, 'month').clone());
                }}
              >
                Next Month <RightOutlined />
              </Button>
            </div>
            <EventTypes types={types} onChange={setTypes} />
          </div>
        )}
      />

      <DividendsTable loading={loading} dividends={dividends} startDate={startDate} endDate={endDate} />

      <EarningsTable loading={loading} earnings={earnings} startDate={startDate} endDate={endDate} />
    </>
  );
}
