import LeftOutlined from '@ant-design/icons/LeftOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import { Button, Calendar, Card, Spin, Table, TableColumnProps, Tag, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Box, Flex } from 'rebass';
import { trackEvent } from '../analytics';
import { DATE_FORMAT } from '../constants';
import { Position } from '../types';
import { buildCorsFreeUrl, getNasdaqTicker, getSymbolFromNasdaqTicker } from '../utils/common';

type Dividend = {
  company: string;
  ticker: string;
  exDate: string;
  payDate: string;
  recDate: string;
  amount: number;
  yield: number;
};

type Earning = {
  ticker: string;
  date: string;
  company: string;
  periodEnding: string;
  eps: number;
  lastEps: number;
};

type EventType = 'earning' | 'ex-dividend' | 'pay-dividend' | 'rec-dividend';

function EventTypes({ types, onChange }: { types: EventType[]; onChange: (types: EventType[]) => void }) {
  function renderTag(type: EventType, color: string, title: string) {
    const isSelected = types.includes(type);
    return (
      <Tag
        style={{ cursor: 'pointer' }}
        color={isSelected ? color : undefined}
        onClick={() => {
          onChange(isSelected ? types.filter((_type) => _type !== type) : types.concat([type]));
        }}
      >
        {title}
      </Tag>
    );
  }
  return (
    <Box>
      {renderTag('earning', 'magenta', 'Earning')}
      {renderTag('ex-dividend', 'blue', 'ED: Ex-Dividend')}
      {renderTag('pay-dividend', 'green', 'PD: Pay Dividend')}
      {renderTag('rec-dividend', 'geekblue', 'RD: Record Dividend')}
    </Box>
  );
}

export function Events({ positions }: { positions: Position[] }) {
  const [events, setEvents] = useState<{ dividends: Dividend[]; earnings: Earning[] }>();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Dayjs>(dayjs().startOf('month'));
  const range = useMemo(() => {
    return { start: dayjs().startOf('month').subtract(1, 'month'), end: dayjs().endOf('month').add(1, 'year') };
  }, []);
  const [types, setTypes] = useState<EventType[]>(['earning', 'ex-dividend', 'pay-dividend', 'rec-dividend']);

  useEffect(() => {
    const _symbols = positions
      .filter((position) => {
        const symbol = position.security.symbol || position.security.name;
        return !(symbol.includes('-') || position.security.type === 'crypto');
      })
      .map((position) => getNasdaqTicker(position.security))
      .join(',');
    if (!_symbols.length) {
      return;
    }

    const url = buildCorsFreeUrl(
      `https://portfolio.nasdaq.com/api/portfolio/getPortfolioEvents/?fromDate=${date
        .clone()
        .subtract(30, 'days')
        .format(DATE_FORMAT)}&toDate=${date
        .clone()
        .endOf('month')
        .add(60, 'days')
        .format(DATE_FORMAT)}&tickers=${_symbols}`,
    );
    setLoading(true);

    fetch(url, {
      cache: 'force-cache',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => response.json())
      .then((response) => {
        if (response) {
          setEvents({
            dividends: response.dividends,
            earnings: response.earnings,
          });
        }
      })
      .catch((error) => console.info('Failed to load events.', error))
      .finally(() => setLoading(false));
  }, [positions, date]);

  function dateCellRender(date: Dayjs) {
    const _events = eventsByDate[date.format(DATE_FORMAT)];

    return _events && _events.length ? (
      <Flex flexWrap="wrap">
        {_events.map((item) => (
          <Box mr={1} mb={1} key={item.ticker}>
            <Tag
              color={
                item.type === 'earning'
                  ? 'magenta'
                  : item.type === 'ex-dividend'
                  ? 'blue'
                  : item.type === 'pay-dividend'
                  ? 'green'
                  : 'geekblue'
              }
            >
              {item.type === 'earning'
                ? ''
                : item.type === 'ex-dividend'
                ? 'ED: '
                : item.type === 'pay-dividend'
                ? 'PD: '
                : 'RD: '}
              {item.ticker}
            </Tag>
          </Box>
        ))}
      </Flex>
    ) : (
      <></>
    );
  }

  function getColumns(): TableColumnProps<Earning>[] {
    return [
      {
        key: 'date',
        title: 'Date',
        dataIndex: 'date',
        render: (text) => dayjs(text).format('MMM DD, YYYY'),
        defaultSortOrder: 'ascend',
        sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
      },
      {
        key: 'Company',
        title: 'Symbol',
        dataIndex: 'ticker',
        render: (ticker) => getSymbolFromNasdaqTicker(ticker),
      },
      {
        key: 'periodEnding',
        title: 'Period Ending',
        dataIndex: 'periodEnding',
      },
      {
        key: 'lastEps',
        title: 'Last EPS',
        dataIndex: 'lastEps',
        align: 'right',
      },
      {
        key: 'eps',
        title: 'EPS',
        dataIndex: 'eps',
        align: 'right',
      },
    ];
  }

  const eventsByDate = useMemo(() => {
    if (!events) {
      return {};
    }

    let result: {
      [K: string]: {
        ticker: string;
        name: string;
        type: EventType;
      }[];
    } = {};
    if (types.includes('earning')) {
      result = events.earnings.reduce((hash, earning) => {
        const earningDate = dayjs(earning.date).format(DATE_FORMAT);
        let earnings = hash[earningDate];
        if (!earnings) {
          earnings = [];
          hash[earningDate] = earnings;
        }
        earnings.push({
          ticker: getSymbolFromNasdaqTicker(earning.ticker),
          name: earning.company,
          type: 'earning',
        });
        return hash;
      }, result);
    }

    result = events.dividends.reduce((hash, dividend) => {
      ['exDate', 'payDate', 'recDate'].forEach((field) => {
        if (!dividend[field]) {
          return;
        }
        const type = field === 'exDate' ? 'ex-dividend' : field === 'payDate' ? 'pay-dividend' : 'rec-dividend';
        if (!types.includes(type)) {
          return;
        }

        const dividendDate = dayjs(dividend[field]).format(DATE_FORMAT);
        let dividends = hash[dividendDate];
        if (!dividends) {
          dividends = [];
          hash[dividendDate] = dividends;
        }
        dividends.push({
          ticker: getSymbolFromNasdaqTicker(dividend.ticker),
          name: dividend.company,
          type,
        });
      });
      return hash;
    }, result);

    return result;
  }, [events, types]);

  return (
    <>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>
        Earnings &amp; Dividends
      </Typography.Title>
      <Calendar
        value={date}
        onSelect={(newDate) => {
          const startOfMonth = newDate.startOf('month');
          if (!date.isSame(startOfMonth)) {
            setDate(startOfMonth);
          }
        }}
        validRange={[dayjs().startOf('month'), dayjs().endOf('month').add(1, 'year')]}
        dateCellRender={dateCellRender}
        headerRender={() => (
          <Box>
            <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap">
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
              <Typography.Title level={3}>
                {date.format('MMMM YYYY')} {loading && <Spin />}
              </Typography.Title>
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
            </Flex>

            <Flex my={2} justifyContent="center" flexWrap="wrap">
              <EventTypes types={types} onChange={setTypes} />
              {/* <Radio.Group
                size="large"
                defaultValue={type}
                onChange={(e) => {
                  setType(e.target.value);
                  trackEvent('earnings-type-change', { type: e.target.value });
                }}
                options={[
                  { label: 'All', value: 'all' },
                  { label: 'Earnings Only', value: 'earnings' },
                  { label: 'Dividends Only', value: 'dividends' },
                ]}
              /> */}
            </Flex>
          </Box>
        )}
      />

      {events?.earnings && !!events?.earnings.length && (
        <Card
          title={<>Upcoming Earnings (Starting {date.format('MMM DD, YYYY')})</>}
          styles={{
            header: { paddingLeft: 16, fontSize: 18, fontWeight: 'bold' },
            body: { padding: 0 },
          }}
          style={{ marginTop: 16, marginBottom: 16 }}
        >
          <Table<Earning>
            columns={getColumns()}
            dataSource={events.earnings.filter((earning) => dayjs(earning.date).isSameOrAfter(date))}
          />
        </Card>
      )}
    </>
  );
}
