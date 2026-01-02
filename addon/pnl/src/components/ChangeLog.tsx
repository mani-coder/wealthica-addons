import { Divider, Image, Tag, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import { formatDate } from '@/utils/common';
import { trackEvent } from '../analytics';

const LOGS: {
  title: string;
  tab?: string;
  description?: string;
  images?: string[];
  date: string;
  link?: React.ReactElement;
}[] = [
  {
    date: '2026-01-01',
    tab: 'Holdings',
    title: 'Enhanced Holding Details & Health Check Cards',
    description:
      'Holding details now include comprehensive health check analysis with opportunity cost charts, issues identification, and strength indicators. The health check card provides quick insights into individual stock performance compared to benchmarks.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Holding%20Details%20_1_giueSJbLm.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Holding%20Details%20_2_eDMAvx7sQ.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Holding%20Details%20_3_IFsLm9xZD.png',
    ],
  },
  {
    date: '2026-01-01',
    tab: 'Health Check',
    title: 'Portfolio Health Check - Identify Underperformers',
    description:
      'The new Health Check tab analyzes all your holdings and provides actionable recommendations. It identifies issues like underperformance vs. benchmarks, high opportunity costs, extended periods below cost basis, and concentration risks. Each holding is scored 0-100 with specific strengths and weaknesses highlighted. Filter by severity, recommendation, or search for specific holdings.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/HealthCheck%20_1_TbKQQ0ix_G.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/HealthCheck%20Card%20_1_gOTVe5P1hT.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/HealthCheck%20Card%20_2_PFojYyDSSG.png',
    ],
  },
  {
    date: '2026-01-01',
    tab: 'Performance',
    title: 'Benchmark Comparison Analysis',
    description:
      'Compare your portfolio performance against major market benchmarks including S&P 500, NASDAQ, TSX, and more. View detailed performance metrics, correlation analysis, and interactive charts showing how your portfolio stacks up. Switch between Canadian and US benchmarks with detailed information about each index.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Performance%20Tab%20_1_Rp50YCcZhq.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Performance%20Tab%20Chart_QM49NGr6XV.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Performance%20Tab%20Yearly%20Breakdown_4y2GP4EKeR.png',
    ],
  },
  {
    date: '2024-01-22',
    tab: 'P&L Charts',
    title: 'Deposit & Withdrawal Flags',
    description:
      'The Deposit Vs Portfolio Value chart now shows the deposits & withdrawls made by you in the timeline.',
    images: ['https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Deposit_Flags_Timeline__ogTZcFJn.png'],
  },
  {
    date: '2024-01-22',
    tab: 'P&L Charts',
    title: 'Base Currency Support',
    description: 'PnL addon now supports showing amounts in the base currency selected by your profile settings.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Base_Currency_USD_bvPAbD4fVq.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Base_Currency_CAD_6UwgywmXaX.png',
    ],
  },
  {
    date: '2022-03-01',
    tab: 'Realized P&L',
    title: 'ACB & Proceeds For Tax Filling',
    description:
      'We have now added the ACB & Proceeds values in Canadian currency in the Realized PnL table to ease the tax filling. You can simply copy over the values to the tax forms now without much hassle. Please note that this value adjusts the transaction fees and is the final cost incurred by you for the buy and sell transactions.',
    images: ['https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_ACB___Proceeds_IaWA9v43sse.png'],
  },
  {
    date: '2021-11-04',
    tab: 'Holdings Analyzer',
    title: 'Cash Table',
    description:
      'We have added a cash table to the Holdings tab. The new cash table will help to go through the remaining cash in all your accounts and run some quick filters and sort for analysis.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Cash_Table__2_9emdIR-pJ5L.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Cash_Table__1__sTSEOzMQdn.png',
    ],
  },
  {
    date: '2021-06-17',
    tab: 'P&L Widgets',
    title: 'P&L % Change Widget',
    description:
      'P&L Ratio (%) Change widget is now published to wealthica and is available under widgets. You can add the widget by selecting manage widgets option and adding P&L % Change widget to the top.',
    link: (
      <Typography.Link href="https://github.com/mani-coder/wealthica-addons/tree/master/widgets/pnl" target="_blank">
        P&amp;L % Change Widget
      </Typography.Link>
    ),
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/pnl-widget-2_NEbh-d-O6.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/pnl-widget-1_q9ZHNXGdU.png',
    ],
  },
  {
    date: '2021-05-18',
    tab: 'Realized P&L',
    title: 'Plot Income, Interest Along With Realized P&L',
    description:
      'We have made few changes to the Realized P&L chart to visualize the income, interest along with the Realized P&L.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_Total_SkXH_ENpd.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_ISmwPJbTB.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_Income_-DAQM_F0GI.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_History_9IKwqx0dG.png',
    ],
  },
  {
    date: '2021-04-20',
    tab: 'Realized P&L',
    title: 'Interest transactions aggregated by day/week/month/year and complete history',
    description:
      'Ever wondered how much interest you are paying on your borrowed margin money. This chart is available under "Realized P&L" tab where you can toggle the checkbox and play with interests and aggregate the interest by day/week/month/year. We also show the interest transactions in a table to have a quick view. Please note the new tab will show up only if you have any interest type transactions.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_Interest_hWDAZtWWUc.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/Realized_PnL_History_9IKwqx0dG.png',
    ],
  },
  {
    date: '2021-04-19',
    tab: 'Events',
    title: 'Table view for the Earnings Calendar',
    description:
      'The table view will be give a quick view of the upcoming earnings for your holdings in addition to the calendar view.',
    images: ['https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/earnings-table__eCvysZ8d.png'],
  },
  {
    date: '2021-04-12',
    tab: 'Gainers/Losers',
    title: 'Stock Level P/L Ratio (%) & P/L Value ($) Timeline',
    description:
      'These new charts show the P/L timeline at a stock level based on your cost basis. You can access these charts in the Gainers/Losers tab by clicking on the stock.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/stock-pnl-ratio-timeline_Rsh-BbaNk.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/stock-pnl-value-timeline_d8yk4s7Zb.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/stock-pnl-timeline-chart_xAEevDsMn.png',
    ],
  },
  {
    date: '2021-04-11',
    tab: 'Events',
    title: 'Upcoming Earnings & Dividends dates for your holdings',
    description:
      'A new tab called Events has been added. This tab will show the upcoming earnings & dividend dates in a calendar.',
    images: ['https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/events_CT25iZoKb.png'],
  },
  {
    date: '2021-04-10',
    tab: 'News',
    title: 'News articles related to your holdings from multiple sources',
    description:
      'A new tab called News has been added. This tab will list some of the recent news corresponding to your holdings. It also has a sentiment toggle.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/news-all_-ezDjr1C1.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/news-sentiment_WokC226oS.png',
    ],
  },
  {
    date: '2021-04-05',
    tab: 'Holdings Analyzer',
    title: 'Holdings Composition Visualizer',
    description:
      'You can now visualize your holdings composition using multiple groups like currency, institution, accounts & account type. This is available under the "Holdings Analyzer" tab. You can now analyze your holdings composition for a specific group by clicking the buttons below the chart. By default a donut chart is displayed and you can hide the positions using the radio toggle below.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/holdings-composition-1_UVfpFJBzK.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/holdings-composition-2_oGAlHs6Fn.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/holdings-composition-3_-6MNRFG8u.png',
    ],
  },
  {
    date: '2021-04-02',
    tab: 'Holdings Analyzer',
    title: 'Portfolio Visualizer Tool Links',
    description:
      'Portfolio Visualizer (https://www.portfoliovisualizer.com/) is an online software platform for portfolio and investment analytics to help you make informed decisions when comparing and analyzing portfolios and investment products. We have added links to portfolio visualizer tools with your holdings and allocation populated so that you can just click and run the reports easily.',
    link: (
      <Typography.Link href="https://www.portfoliovisualizer.com/" target="_blank">
        Portfolio Visualizer
      </Typography.Link>
    ),
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/portfolio-visualizer-1__UpG0quyW.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/portfolio-visualizer-2_J54JNE5ON.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/portfolio-visualizer-3_HOu1gLKPp.png',
    ],
  },
  {
    date: '2021-03-31',
    tab: 'Realized P&L',
    title: 'Your realized/closed P/L aggregated by day/week/month/year & complete history',
    description:
      'If you are an active trader you would definitely want to keep track of your daily/weekly/monthly/yearly closed P/L. The new tab "Realized P&L" is exclusively added to simplify this usecase. You can see your closed/realized P/L aggregated by day/week/month/year. You can also see your closed/realized P/L transactions history with details.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/realized-pnl-1_sbd3OZJL4.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/realized-pnl-2_fHY3wBRDI.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/realized-pnl-3_Lrlpbuenv.png',
    ],
  },
  {
    date: '2021-03-23',
    tab: 'Gainers/Losers',
    title: 'View Gainers & Losers by P/L Value or Ratio',
    description:
      'You can now view the gainers & losers by P/L value in addition to P/L ratio. You can do this by using the new toggle in the Gainers/Losers tab.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/show-by-pnl-value_GE8t6tOqe.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/show-by-pnl-ratio_Q83tHPI5J.png',
    ],
  },
  {
    date: '2021-03-20',
    title: 'P&L Widgets',
    description:
      'P/L Ratio (%) Change chart in the P/L charts is written as an elegant developer widget. The widget is submitted to wealthica team for publication. Incase you are interested in trying it out, click on the link below.',
    link: (
      <Typography.Link href="https://github.com/mani-coder/wealthica-pnl-widget" target="_blank">
        P/L Ratio (%) Change Developer Widget
      </Typography.Link>
    ),
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/pnl-widget-2_NEbh-d-O6.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/pnl-widget-1_q9ZHNXGdU.png',
    ],
  },
  {
    date: '2021-03-05',
    tab: 'P&L Charts',
    title: 'P&L % Change Over Multiple Time Periods Chart',
    description:
      'You can now view your P/L ratio (%) change across multiple pre-defined time periods like 1D(1 day), WTD(Week To Date), MTD(Month To Date), 1M(1 Month), YTD(Year To Date), FY 2020(Jan 1 -Dec 31, 2020) in the P&L Charts tab.',
    images: ['https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/pnl-yoy-chart_F_NqYoQNP.png'],
  },
  {
    date: '2021-03-01',
    tab: 'Holdings Analyzer',
    title: 'Visualize Your Holdings Using Column/Pie Charts',
    description:
      'In this new tab "Holdings Analyzer", you can visualize your holdings in a column & pie chart. You can also click on a stock and view the details and load the stock price timeline with your transactions plotted on it for better visualization. You can also use the search bar to select a stock in case your aren\'t able to locate your stock in the charts. There is also a holdings table, incase you want to skim through all your holdings in a table view.',
    images: [
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/holdings-analyzer-1_SvA5pT4QD.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/holdings-analyzer-2_6dh19zbOd.png',
      'https://ik.imagekit.io/manicoder/wealthica-portfolio-addon/holdings-table_D9eT7TaFo.png',
    ],
  },
];

function LogItem({ log }: { log: (typeof LOGS)[number] }) {
  return (
    <>
      <div className="mb-2 flex space-x-2 items-center">
        <div className="text-lg font-bold">{log.title}</div>
        {log.tab && (
          <Tag variant="outlined" color="green">
            {log.tab} Tab
          </Tag>
        )}
      </div>

      {log.description && <Typography.Text>{log.description}</Typography.Text>}
      {log.link && <div className="py-2 mb-2">{log.link}</div>}
      <div className="flex my-6 flex-wrap">
        {log.images?.map((src) => (
          <Image
            key={src}
            onClick={() => {
              trackEvent('preview-change-log-image', { title: log.title });
            }}
            src={src}
            width={200}
            preview={true}
            fallback="data:image/png;base64,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"
          />
        ))}
      </div>
      <Divider />
    </>
  );
}

export default function ChangeLog() {
  const items = LOGS.map((log, index) => ({
    key: index,
    title: (
      <Tag variant="filled" color="purple">
        {formatDate(dayjs(log.date))}
      </Tag>
    ),
    content: <LogItem log={log} />,
  }));
  return (
    <div className="my-4 max-h-[calc(100vh-300px)] overflow-y-auto">
      <Timeline titleSpan="10%" items={items} mode="left" />
    </div>
  );
}
