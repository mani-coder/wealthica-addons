<script lang="ts">
  import moment, { Moment } from "moment";
  import type { Portfolio } from "../types";
  import { getPreviousWeekday } from "../utils";
  import DateValue from "./DateValue.svelte";
  import ArrowDown from "./icons/ArrowDown.svelte";
  import ArrowUp from "./icons/ArrowUp.svelte";
  import PnLRanges from "./PnLRanges.svelte";
  import Tooltip from "./Tooltip.svelte";

  export let portfolios: Portfolio[] = [];
  export let privateMode: boolean;
  let selectedPnLIndex = 0;
  const portfolioByDate = portfolios.reduce((hash, portfolio) => {
    hash[portfolio.date] = portfolio;
    return hash;
  }, {} as { [K: string]: Portfolio });

  const DATE_DISPLAY_FORMAT = "MMM DD, YYYY";

  function getNearestPortfolioDate(date: string): Portfolio | undefined {
    return portfolioByDate[date];
  }

  function getData() {
    let currentPortfolio = portfolios[portfolios.length - 1];
    const currentDate = moment().utc();
    if (
      currentDate.format("YYYY-MM-DD") === currentPortfolio.date &&
      currentDate.hour() < 20 &&
      portfolios.length > 1
    ) {
      currentPortfolio = portfolios[portfolios.length - 2];
    }
    if (moment(currentPortfolio.date).isoWeekday() > 5) {
      const weekday = getPreviousWeekday(currentPortfolio.date).format(
        "YYYY-MM-DD"
      );
      currentPortfolio = portfolioByDate[weekday];
    }

    const lastDate = currentPortfolio.date;

    const portfolioKeys = new Set();
    const portfolioValues: {
      id: string;
      label: string;
      date: Moment;
      startPortfolio: Portfolio;
      endPortfolio: Portfolio;
    }[] = [];

    [
      { id: "1D", label: "1 Day", date: getPreviousWeekday(lastDate) },
      {
        id: "1W",
        label: "1 Week",
        date: moment(lastDate).subtract(1, "weeks"),
      },
      {
        id: "1M",
        label: "1 Month",
        date: moment(lastDate).subtract(1, "months").add(1, "days"),
      },
      {
        id: "3M",
        label: "3 Months",
        date: moment(lastDate).subtract(3, "months").add(1, "days"),
      },
      {
        id: "6M",
        label: "6 Months",
        date: moment(lastDate).subtract(6, "months").add(1, "days"),
      },
      {
        id: "1Y",
        label: "1 Year",
        date: moment(lastDate).subtract(1, "years").add(1, "days"),
      },
      {
        id: "2Y",
        label: "2 Years",
        date: moment(lastDate).subtract(2, "years").add(1, "days"),
      },
      {
        id: "3Y",
        label: "3 Years",
        date: moment(lastDate).subtract(3, "years").add(1, "days"),
      },
      {
        id: "5Y",
        label: "5 Years",
        date: moment(lastDate).subtract(5, "years").add(1, "days"),
      },
      {
        id: "MTD",
        label: "Month To Date",
        date: moment(lastDate).startOf("month"),
      },
      {
        id: "WTD",
        label: "Week To Date",
        date: moment(lastDate).startOf("week"),
      },
      {
        id: "YTD",
        label: "Year To Date",
        date: moment(lastDate).startOf("year"),
      },
    ].map((value) => {
      const portfolio = getNearestPortfolioDate(
        value.date.format("YYYY-MM-DD")
      );
      if (portfolio) {
        const key = `${portfolio.date}-${currentPortfolio.date}`;
        if (!portfolioKeys.has(key)) {
          portfolioValues.push({
            id: value.id,
            label: value.label,
            date: value.date,
            startPortfolio: portfolio,
            endPortfolio: currentPortfolio,
          });
          portfolioKeys.add(key);
        }
      }
    });

    [1, 2, 3, 4].forEach((value) => {
      const year = moment(lastDate).subtract(value, "years").year();
      const startDate = moment().year(year).month("Jan").startOf("month");
      const startPortfolio = getNearestPortfolioDate(
        startDate.format("YYYY-MM-DD")
      );
      const endPortfolio = getNearestPortfolioDate(
        moment().year(year).month("Dec").endOf("month").format("YYYY-MM-DD")
      );

      if (startPortfolio && endPortfolio) {
        const key = `${startPortfolio.date}-${endPortfolio.date}`;
        if (!portfolioKeys.has(key)) {
          portfolioValues.push({
            id: `FY ${year}`,
            label: `Jan - Dec ${year}`,
            date: startDate,
            startPortfolio,
            endPortfolio,
          });
          portfolioKeys.add(key);
        }
      }
    });

    const data = portfolioValues
      .filter((value) => value.endPortfolio.date !== value.startPortfolio.date)
      .sort((a, b) => b.date.valueOf() - a.date.valueOf())
      .map((value) => {
        const startPnl =
          value.startPortfolio.value - value.startPortfolio.deposits;
        const endPnl = value.endPortfolio.value - value.endPortfolio.deposits;
        const startRatio = (startPnl / value.startPortfolio.deposits) * 100;
        const endRatio = (endPnl / value.endPortfolio.deposits) * 100;

        const changeValue = endPnl - startPnl;
        const changeRatio = endRatio - startRatio;

        return {
          id: value.id,
          label: value.label,
          date: value.date.format(DATE_DISPLAY_FORMAT),
          startDate: moment(value.startPortfolio.date).format(
            DATE_DISPLAY_FORMAT
          ),
          endDate: moment(value.endPortfolio.date).format(DATE_DISPLAY_FORMAT),
          startPnl,
          startRatio,
          endPnl,
          endRatio,
          changeRatio,
          changeValue,
        };
      });

    console.debug("PnL change data -- ", data);

    return data;
  }

  const data = getData();
  $: pnl = selectedPnLIndex < data.length ? data[selectedPnLIndex] : data[0];

  function handlePnlClick(pnlIndex: number) {
    selectedPnLIndex = pnlIndex;
  }
</script>

<div class="w-full h-full overflow-scroll">
  <!-- <img src="favicon.png" alt="P&L" width={20} height={20} /> -->

  <h5 class="my-0 mb-1 text-sm text-center text-gray-500">
    <div class="font-semibold">P&L % CHANGE</div>
    <div class="font-bold">{pnl.label.toUpperCase()}</div>
  </h5>

  <div class="flex flex-col space-y-1 w-full p-2 bg-gray-100 rounded-lg">
    <div class="flex items-center px-2 space-x-3">
      <div class="mr-3">
        {#if pnl.changeRatio >= 0}<ArrowUp />{:else}<ArrowDown />{/if}
      </div>

      <div
        class={`flex-grow flex-col ${
          pnl.changeRatio >= 0 ? "text-green-500" : "text-red-500"
        }`}
      >
        <div class="text-base font-medium">
          <Tooltip
            tooltip="This is the difference between your latest P&L % and P&L % for the selected date."
          >
            <div>{pnl.changeRatio.toFixed(2)}%</div>
          </Tooltip>
        </div>
        <div class="text-sm">
          {#if privateMode}
            $--
          {:else}
            <Tooltip
              tooltip="This is the difference between your latest P&L and the P&L for the selected date."
            >
              <span>
                {pnl.changeValue >= 0 ? "" : "-"}${Math.abs(
                  Number(pnl.changeValue.toFixed(2))
                ).toLocaleString()}
              </span>
            </Tooltip>
          {/if}
        </div>
      </div>
    </div>

    <div class="border-gray-300 border-t px-1" />

    <div class="flex-col space-y-1 pt-1">
      <div class="flex text-xs font-light text-gray-500">
        <span class="w-5/12">Date</span>
        <div class="flex w-7/12 pl-1 justify-between">
          <span>P&L %</span>
          <span>P&L</span>
        </div>
      </div>

      <DateValue
        date={pnl.startDate}
        value={pnl.startPnl}
        ratio={pnl.startRatio}
        {privateMode}
      />
      <DateValue
        date={pnl.endDate}
        value={pnl.endPnl}
        ratio={pnl.endRatio}
        {privateMode}
      />
    </div>
  </div>

  <div class="w-full mt-3 px-1">
    <PnLRanges {data} onClick={handlePnlClick} {selectedPnLIndex} />
  </div>
</div>
