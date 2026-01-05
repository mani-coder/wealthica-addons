import { useEffect, useState } from 'react';
import type { Account, Position } from '../types';
import { getYahooSymbol } from '../utils/common';
import { isFund } from '../utils/securityHelpers';
import { useFundData } from './useFundData';
import { useSectorData } from './useSectorData';

type EnrichedAccount = Account & {
  positions: Array<
    Position & {
      sector?: string;
    }
  >;
};

/**
 * Helper function to assign sector based on position type
 * For non-equity positions, returns their type as the sector name
 * For equity positions, uses Yahoo Finance sector data from the provided map
 *
 * @param position - The position to assign sector for
 * @param sectorMap - Map of Yahoo symbols to sector data
 * @returns The assigned sector name
 */
function assignSector(position: Position, sectorMap: Map<string, { sector: string }>): string {
  if (position.type === 'crypto') {
    return 'Crypto';
  }
  if (position.type === 'etf') {
    return 'ETF';
  }
  if (position.type === 'mutual_fund') {
    return 'Mutual Fund';
  }
  if (position.type === 'money_market') {
    return 'Money Market';
  }
  if (position.type === 'equity') {
    // Only equity positions use Yahoo Finance sector data
    const yahooSymbol = getYahooSymbol(position.security);
    const sectorData = sectorMap.get(yahooSymbol);
    return sectorData?.sector || 'Unknown';
  }
  return 'Unknown';
}

/**
 * Custom hook to enrich accounts with sector data and fund weightings
 * This hook fetches sector information from Yahoo Finance and fund sector weightings
 * for ETFs and mutual funds, then assigns appropriate sectors to each position
 *
 * @param accounts - The accounts to enrich
 * @param enabled - Whether to fetch and enrich data (default: true)
 */
export function useSectorEnrichment(accounts: Account[], enabled: boolean = true) {
  const { fetchSectorData } = useSectorData();
  const { fetchFundSectorWeightings } = useFundData();
  const [accountsWithSectors, setAccountsWithSectors] = useState<EnrichedAccount[]>(accounts);
  const [fundSectorWeightings, setFundSectorWeightings] = useState<Map<string, Record<string, number>>>(new Map());

  useEffect(() => {
    // If not enabled, just return the original accounts
    if (!enabled) {
      setAccountsWithSectors(accounts);
      setFundSectorWeightings(new Map());
      return;
    }

    // Only fetch sector data for equity positions - others just use their type as sector
    const equityPositions = accounts.flatMap((account) =>
      account.positions.filter((position) => position.type === 'equity'),
    );

    const symbols = Array.from(new Set(equityPositions.map((position) => getYahooSymbol(position.security))));

    // Assign sectors to all positions immediately after fetching equity sector data
    fetchSectorData(symbols).then((sectorMap) => {
      const updatedAccounts = accounts.map((account) => ({
        ...account,
        positions: account.positions.map((position) => ({
          ...position,
          sector: assignSector(position, sectorMap),
        })),
      }));
      setAccountsWithSectors(updatedAccounts);
    });

    // Get fund symbols (ETF and mutual fund) for fetching sector weightings
    const fundSymbols = accounts
      .flatMap((account) => account.positions)
      .filter((position) => isFund(position))
      .map((position) => getYahooSymbol(position.security));

    // Fetch fund weightings in parallel (independent of sector assignment)
    fetchFundSectorWeightings(fundSymbols).then((weightings) => {
      setFundSectorWeightings(weightings);
    });
  }, [accounts, enabled, fetchSectorData, fetchFundSectorWeightings]);

  return { accountsWithSectors, fundSectorWeightings };
}
