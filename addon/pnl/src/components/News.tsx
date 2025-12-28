import CaretDownOutlined from '@ant-design/icons/CaretDownOutlined';
import CaretUpOutlined from '@ant-design/icons/CaretUpOutlined';
import { Empty, Radio, Spin, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { trackEvent } from '../analytics';
import { Position } from '../types';
import { buildCorsFreeUrl, getNasdaqTicker, getSymbol, getSymbolFromNasdaqTicker } from '../utils/common';

type NewsResult = {
  timestamp: Dayjs;
  name: string;
  symbol: string;
  sentiment: string;
  title: string;
  url: string;
  source: string;
};

function Dot() {
  return <span style={{ fontSize: 16 }}> &bull; </span>;
}

function NewsItem({ news }: { news: NewsResult }) {
  return (
    <div className="pb-4 mb-2" key={news.title}>
      <div className="flex items-center mb-2">
        <div style={{ fontSize: 15, fontWeight: 500, paddingBottom: 4, paddingRight: 4 }}>
          <Typography.Link href={news.url} target="_blank" rel="noopener noreferrer">
            {news.title}
          </Typography.Link>
        </div>

        {news.sentiment === 'positive' ? (
          <CaretUpOutlined style={{ color: 'green', fontSize: 25 }} />
        ) : news.sentiment !== 'neutral' ? (
          <CaretDownOutlined style={{ color: 'red', fontSize: 25 }} />
        ) : undefined}
      </div>

      <div style={{ fontSize: 13, color: '#8c8c8c' }}>
        {news.source}
        <Dot />
        {dayjs(news.timestamp).format('MMM DD, YYYY hh:mm A')} EDT
        <Dot />
        {news.name} <Dot />
        {news.symbol}
      </div>

      <hr />
    </div>
  );
}

function News({ positions }: { positions: Position[] }) {
  const [news, setNews] = useState<{ [K: string]: NewsResult[] }>({});
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState<string>('All');
  const [sentiment, setSentiment] = useState<'positive' | 'negative' | 'all'>('all');

  const symbols = useMemo(() => {
    return ['All'].concat(
      Array.from(
        new Set(
          positions
            .filter((position) => position.security.type !== 'crypto')
            .map((position) => getSymbol(position.security)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    );
  }, [positions]);

  function fetchNews(symbols: string[]) {
    const _symbols = symbols.join(',');
    const url = buildCorsFreeUrl(`https://portfolio.nasdaq.com/api/portfolio/getPortfolioNews/?tickers=${_symbols}`);
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
          const validSymbols = new Set<string>();
          // addedOn: "2021-04-09T21:25:20.63"
          // articleTimestamp: "2021-04-09T16:16:09"
          // companyName: "Apple"
          // date: "2021-04-09T00:00:00"
          // publishTimeFull: "2021-04-09T16:16:09-04:00"
          // sentiment: "neutral"
          // siteName: "Reuters"
          // stockType: "stock"
          // ticker: "AAPL"
          // title: "US STOCKS-S&P 500, Dow climb for third day and close at records"
          // url: "https://www.nasdaq.com/articles/us-stocks-sp-500-dow-climb-for-third-day-and-close-at-records-2021-04-09-0"
          // urlString: "https://www.nasdaq.com/articles/us-stocks-sp-500-dow-climb-for-third-day-and-close-at-records-2021-04-09-0"
          const _news = response.reduce(
            (hash: { [key: string]: any }, newsRecord: any) => {
              const symbol = getSymbolFromNasdaqTicker(newsRecord.ticker);
              validSymbols.add(symbol);
              const newsResult = {
                timestamp: dayjs(newsRecord.articleTimestamp || newsRecord.addedOn),
                name: newsRecord.companyName,
                symbol,
                sentiment: newsRecord.sentiment,
                title: newsRecord.title,
                url: newsRecord.url,
                source: newsRecord.siteName,
              };

              if (!hash[symbol]) {
                hash[symbol] = [];
              }
              hash[symbol].push(newsResult);

              return hash;
            },
            symbols.length === 1 ? { [getSymbolFromNasdaqTicker(symbols[0])]: [] } : {},
          );
          setNews({ ...news, ..._news });
        }
      })
      .catch((error) => console.info('Failed to load news articles.', error))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const _symbols = positions
      .filter((position) => {
        const symbol = position.security.symbol || position.security.name;
        return !(symbol.includes('-') || position.security.type === 'crypto');
      })
      .map((position) => getNasdaqTicker(position.security));
    if (!_symbols.length) {
      return;
    }

    setSymbol('All');
    setTimeout(() => fetchNews(_symbols), 100);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  const newsContainerRef = useRef<HTMLDivElement>();

  const selectedNews = useMemo(() => {
    const results = symbol === 'All' ? Object.values(news).flat() : news[symbol] || [];
    return sentiment === 'all' ? results : results.filter((result) => result.sentiment === sentiment);
  }, [news, symbol, sentiment]);

  return (
    <div className="flex flex-col mb-6 items-center">
      <div className="flex w-full justify-center mb-6">
        <Radio.Group
          size="large"
          defaultValue={sentiment}
          onChange={(e) => {
            setSentiment(e.target.value);
            trackEvent('news-sentiment-toggle', { sentiment: e.target.value });
          }}
          buttonStyle="solid"
        >
          <Radio.Button key="all" value="all">
            All
          </Radio.Button>
          <Radio.Button key="positive" value="positive">
            <CaretUpOutlined style={{ color: 'green' }} /> Bullish
          </Radio.Button>
          <Radio.Button key="negative" value="negative">
            <CaretDownOutlined style={{ color: 'red' }} /> Bearish
          </Radio.Button>
        </Radio.Group>
      </div>

      <div className="flex w-full mb-2 space-x-2">
        <div className="flex flex-col items-end w-1/4">
          <div className="w-full mb-2">
            <Radio.Group
              className="w-full"
              onChange={(e) => {
                const _symbol = e.target.value;
                setSymbol(_symbol);
                if (_symbol !== 'All' && !news[_symbol]) {
                  setTimeout(() => {
                    fetchNews([_symbol.endsWith('.TO') ? `TSE:${_symbol.replace('.TO', '')}` : _symbol]);
                  }, 50);
                }

                window.scroll({ top: 0, left: 0, behavior: 'smooth' });
                if (newsContainerRef?.current) {
                  newsContainerRef.current.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                }
              }}
              value={symbol}
              buttonStyle="solid"
              optionType="button"
            >
              {symbols.map((symbol) => (
                <Radio.Button
                  key={symbol}
                  style={{
                    width: '100%',
                    display: 'flex',
                    height: '50px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    lineHeight: '30px',
                  }}
                  value={symbol}
                >
                  {symbol}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>
        </div>

        {selectedNews.length ? (
          <div ref={newsContainerRef as any} className="w-3/4 h-[70vh] overflow-scroll">
            {selectedNews.map((_news, index) => (
              <NewsItem key={`${symbol}-${index}`} news={_news} />
            ))}
          </div>
        ) : (
          <div className="flex justify-center py-6 w-3/4">
            {loading ? <Spin size="large" /> : <Empty description="No News Articles Found!" />}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(News);
