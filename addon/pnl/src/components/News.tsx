import CaretDownOutlined from '@ant-design/icons/CaretDownOutlined';
import CaretUpOutlined from '@ant-design/icons/CaretUpOutlined';
import Empty from 'antd/es/empty';
import Typography from 'antd/es/typography';
import Radio from 'antd/lib/radio';
import Spin from 'antd/lib/spin';
import moment, { Moment } from 'moment';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex } from 'rebass';
import { trackEvent } from '../analytics';
import { Position } from '../types';
import { buildCorsFreeUrl, getNasdaqTicker, getSymbol, getSymbolFromNasdaqTicker } from '../utils';

type NewsResult = {
  timestamp: Moment;
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
    <Box pb={2} key={news.title}>
      <Flex alignItems="center">
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
      </Flex>

      <div style={{ fontSize: 13, color: '#8c8c8c' }}>
        {news.source}
        <Dot />
        {moment(news.timestamp).format('MMM DD, YYYY hh:mm A')} EDT
        <Dot />
        {news.name} <Dot />
        {news.symbol}
      </div>

      <hr />
    </Box>
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
            (hash, newsRecord) => {
              const symbol = getSymbolFromNasdaqTicker(newsRecord.ticker);
              validSymbols.add(symbol);
              const newsResult = {
                timestamp: moment(newsRecord.articleTimestamp || newsRecord.addedOn),
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
    <Flex flexDirection="column" mb={3} alignItems="center">
      <Flex width={1} justifyContent="center" mb={3}>
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
      </Flex>

      <Flex width={1}>
        <Flex flexDirection="column" alignItems="flex-end" px={2} width={1 / 4}>
          <Box width={1}>
            <Radio.Group
              style={{ width: '100%' }}
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
          </Box>
        </Flex>

        {!!selectedNews.length ? (
          <Box ref={newsContainerRef} width={3 / 4} px={2} height="70vh" style={{ overflow: 'scroll' }}>
            {selectedNews.map((_news, index) => (
              <NewsItem key={`${symbol}-${index}`} news={_news} />
            ))}
          </Box>
        ) : (
          <Flex justifyContent="center" width={3 / 4} py={3}>
            {loading ? <Spin size="large" /> : <Empty description="No News Articles Found!" />}
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}

export default React.memo(News);
