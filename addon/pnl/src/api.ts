import type { Dayjs } from 'dayjs';
import { DATE_FORMAT } from './constants';
import type { Currencies } from './context/CurrencyContext';
import type { Account, AccountTransaction, CashFlow, Position, Transaction } from './types';
import { getDate, getSymbol, getYahooSymbol, normalizeAccountType } from './utils/common';

//
// We can properly move the securities from one account to another by marking the description or notes
// as accounts transfer, this is a manual work to handle the securities transfer since the amounts need
// to be adjusted anyway.
//
const isSecuritiesAccountsTransfer = (transaction: any) =>
  transaction.type &&
  transaction.type.toLowerCase() === 'transfer' &&
  (transaction.description?.startsWith('[Accounts Transfer]') || transaction.note?.includes('Accounts Transfer'));

export const parseCurrencyReponse = (response: any) => {
  let date = getDate(response.from);
  return response.data.reduce((hash: any, value: any) => {
    if (value) {
      hash[date.format(DATE_FORMAT)] = Number(value);
    }
    // Move the date forward.
    date = date.add(1, 'days');
    return hash;
  }, {});
};

export const parseGroupNameByIdReponse = (response: any): { [K: string]: string } =>
  (response || []).reduce((hash: any, group: any) => {
    hash[group._id] = group.name;
    return hash;
  }, {});

export function isValidAccountGroup(groups?: string[], accountGroups?: string[]) {
  // No group selection, don't ignore the account.
  if (!groups || !groups.length) {
    return true;
  }
  // If the account isn't mapped to a group, ignore the account since the group selection is ON.
  if (!accountGroups || !accountGroups.length) {
    return false;
  }
  return groups.some((group) => accountGroups.includes(group));
}

export const parseInstitutionsResponse = (response: any, groups?: string[], institutions?: string[]): Account[] => {
  const accounts: Account[] = [];
  return response
    .filter((institution: any) => !institutions || !institutions.length || institutions.includes(institution.id))
    .reduce((accounts: any, instutition: any) => {
      return accounts.concat(
        instutition.investments
          .filter((account: any) => isValidAccountGroup(groups, account.groups) && !account.ignored)
          .map((account: any) => {
            return {
              id: account._id,
              institution: instutition.id,
              instutitionName: instutition.name,
              name: `${instutition.name} ${account.name}`,
              created_at: getDate(instutition.creation_date),
              type: normalizeAccountType(
                account.type
                  ? account.type
                  : account.name?.includes('-')
                    ? account.name.split('-')[1].trim()
                    : account.name,
              ),
              groups: account.groups,
              cash: account.cash,
              value: account.value,
              currency_value: account.currency_value,
              currency: account.currency,
              positions: (account.positions || []).map((position: any) => ({
                ...position,
                symbol: getSymbol(position.security),
              })),
            };
          }),
      );
    }, accounts);
};

export const parsePortfolioResponse = (response: any, startDate?: Dayjs) => {
  const data = response.history.total;

  let date = getDate(data.from);
  return data.data.reduce((hash: any, value: any) => {
    // Filter out dates before startDate if provided
    if (value !== null && value !== undefined && (!startDate || date.isSameOrAfter(startDate, 'day'))) {
      hash[date.format(DATE_FORMAT)] = Number(value);
    }

    // Move the date forward.
    date = date.add(1, 'days');
    return hash;
  }, {});
};

const getInvestmentCurrency = (investment: string) => {
  const currency = investment?.includes(':') && investment.split(':').pop();
  return currency && currency.length === 3 ? currency : 'cad';
};

type CashFlowDirection = 'deposit' | 'withdrawal';

type CashFlowCandidate = {
  id: string;
  transaction: any;
  direction: CashFlowDirection;
  nativeAmount: number;
  currency: string;
  date: Dayjs;
};

const getTransactionId = (transaction: any): string => transaction.id || transaction._id;

const isSecurityRelatedCashMovement = (transaction: any): boolean =>
  Boolean(transaction.symbol) ||
  transaction.category?.toLowerCase() === 'securities trades' ||
  transaction.origin_type?.toUpperCase().includes('REINVESTMENT');

const isExcludedTransferOrigin = (transaction: any): boolean =>
  ['FXT', 'BRW', 'EXCHTRADE'].includes(transaction.origin_type?.toUpperCase());

const isTransferLike = (transaction: any): boolean =>
  ['transfer', 'transfer_in', 'transfer_out'].includes(transaction.type?.toLowerCase()) ||
  transaction.category?.toLowerCase() === 'transfers' ||
  transaction.origin_type?.toUpperCase().includes('TRANSFER');

function getCashFlowDirection(transaction: any): CashFlowDirection | undefined {
  const type = transaction.type?.toLowerCase();
  if (type === 'deposit') return 'deposit';
  if (type === 'withdrawal') return 'withdrawal';
  if (type === 'transfer_in') return 'deposit';
  if (type === 'transfer_out') return 'withdrawal';
  if (type === 'transfer') {
    return Number(transaction.currency_amount) < 0 ? 'withdrawal' : 'deposit';
  }
  return undefined;
}

function getCashFlowCandidates(response: any[]): CashFlowCandidate[] {
  return response.flatMap((transaction: any) => {
    if (transaction.deleted || isSecuritiesAccountsTransfer(transaction) || isExcludedTransferOrigin(transaction)) {
      return [];
    }

    const direction = getCashFlowDirection(transaction);
    const nativeAmount = Math.abs(Number(transaction.currency_amount));
    if (
      !direction ||
      !Number.isFinite(nativeAmount) ||
      nativeAmount === 0 ||
      isSecurityRelatedCashMovement(transaction)
    ) {
      return [];
    }

    return [
      {
        id: getTransactionId(transaction),
        transaction,
        direction,
        nativeAmount,
        currency: getInvestmentCurrency(transaction.investment),
        date: getDate(transaction.date),
      },
    ];
  });
}

/**
 * Find transfer legs that move cash between two accounts already included in the portfolio.
 * A pair must have the same native currency/amount, opposite directions, different accounts,
 * be no more than three calendar days apart, and have transfer metadata on at least one leg.
 */
function getInternalTransferIds(candidates: CashFlowCandidate[]): Set<string> {
  const internalIds = new Set<string>();
  const deposits = candidates.filter((candidate) => candidate.direction === 'deposit');

  for (const withdrawal of candidates.filter((candidate) => candidate.direction === 'withdrawal')) {
    const matchingDeposit = deposits.find(
      (deposit) =>
        !internalIds.has(deposit.id) &&
        deposit.currency === withdrawal.currency &&
        Math.abs(deposit.nativeAmount - withdrawal.nativeAmount) < 0.005 &&
        deposit.transaction.investment !== withdrawal.transaction.investment &&
        Math.abs(deposit.date.diff(withdrawal.date, 'day')) <= 3 &&
        (isTransferLike(deposit.transaction) || isTransferLike(withdrawal.transaction)),
    );

    if (matchingDeposit) {
      internalIds.add(withdrawal.id);
      internalIds.add(matchingDeposit.id);
    }
  }

  return internalIds;
}

export const computeCashFlowByDate = (response: any, currencies: Currencies): { [K: string]: CashFlow } => {
  const candidates = getCashFlowCandidates(response);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const internalTransferIds = getInternalTransferIds(candidates);

  return response
    .filter((t: any) => !t.deleted)
    .reduce((hash: any, transaction: any) => {
      const type = transaction.type;
      if (['sell', 'buy', 'unknown', 'split', 'reinvest'].includes(type)) {
        return hash;
      }

      const date = getDate(transaction.date);
      const dateKey = date.format(DATE_FORMAT);
      const portfolioData = hash[dateKey]
        ? hash[dateKey]
        : {
            date: dateKey,
            deposit: 0,
            withdrawal: 0,
            interest: 0,
            income: 0,
            externalFlow: 0,
          };

      let currencyAmountValue = Number(transaction.currency_amount);
      if (Number.isNaN(currencyAmountValue) || currencyAmountValue === undefined) {
        currencyAmountValue = 0;
      }
      const amount = currencies.getValue(getInvestmentCurrency(transaction.investment), currencyAmountValue, date);

      // Replace NaN with 0 to prevent NaN propagation
      const safeAmount = Number.isNaN(amount) ? 0 : amount;

      const candidate = candidatesById.get(getTransactionId(transaction));
      if (candidate && !internalTransferIds.has(candidate.id)) {
        const externalAmount = Math.abs(safeAmount);
        if (candidate.direction === 'deposit') {
          portfolioData.deposit += externalAmount;
          portfolioData.externalFlow += externalAmount;
        } else {
          portfolioData.withdrawal += externalAmount;
          portfolioData.externalFlow -= externalAmount;
        }
      } else if (['fee', 'interest', 'tax', 'income', 'dividend', 'distribution'].includes(type)) {
        if (safeAmount > 0) {
          portfolioData.income += safeAmount;
        } else {
          portfolioData.interest += Math.abs(safeAmount);
        }
      } else if (
        !candidate &&
        !['deposit', 'withdrawal', 'transfer', 'transfer_in', 'transfer_out', 'merger'].includes(type)
      ) {
        console.debug('Unhandled type', type);
      }
      hash[dateKey] = portfolioData;
      return hash;
    }, {});
};

export const parseSecurityTransactionsResponse = (response: any, currencies: Currencies): Transaction[] => {
  return response
    .filter((t: any) => !t.deleted && t.type)
    .filter(
      (transaction: any) =>
        ([
          'sell',
          'buy',
          'income',
          'dividend',
          'distribution',
          'tax',
          'fee',
          'split',
          'reinvest',
          'transfer_in',
          'transfer_out',
        ].includes(transaction.type.toLowerCase()) ||
          isSecuritiesAccountsTransfer(transaction)) &&
        (transaction.security || transaction.symbol),
    )
    .map((transaction: any) => {
      const date = getDate(transaction.date);

      let currencyAmountValue = Number(transaction.currency_amount);
      if (Number.isNaN(currencyAmountValue) || currencyAmountValue === undefined) {
        currencyAmountValue = 0;
      }
      const amount = currencies.getValue(getInvestmentCurrency(transaction.investment), currencyAmountValue, date);

      let splitRatio: number | undefined;
      if (transaction.type === 'split' && transaction.description?.includes('@')) {
        // Try to match format like "SPLIT @ X:Y" or "Reverse Split @ 8:9"
        const ratioMatch = transaction.description.match(/@\s*([0-9]+):([0-9]+)/);
        if (ratioMatch?.[1] && ratioMatch?.[2]) {
          splitRatio = parseInt(ratioMatch[1], 10) / parseInt(ratioMatch[2], 10);
        } else {
          // Try to match format like "REVERSE SPLIT @ 0.88888889"
          const decimalMatch = transaction.description.match(/@\s*([0-9.]+)/);
          if (decimalMatch?.[1]) {
            splitRatio = parseFloat(decimalMatch[1]);
          }
        }
        if (splitRatio !== undefined) {
          splitRatio = Number(splitRatio.toFixed(5));
        }
      }

      const currencyAmount = transaction.currency_amount
        ? Math.abs(transaction.currency_amount + (transaction.fee || 0) * (transaction.type === 'buy' ? 1 : -1))
        : undefined;

      const normalizedType = isSecuritiesAccountsTransfer(transaction)
        ? amount < 0
          ? 'sell'
          : 'buy'
        : transaction.type === 'transfer_in'
          ? 'buy'
          : transaction.type === 'transfer_out'
            ? 'sell'
            : transaction.type;
      const rawShares = Number(transaction.quantity ?? 0);
      const normalizedShares =
        normalizedType === 'sell'
          ? -Math.abs(rawShares)
          : ['buy', 'reinvest'].includes(normalizedType)
            ? Math.abs(rawShares)
            : rawShares;

      const _transaction: Transaction = {
        date,
        id: transaction.id,
        account: transaction.investment,
        symbol: transaction.security ? getSymbol(transaction.security) : transaction.symbol,
        ticker: transaction.security ? getYahooSymbol(transaction.security) : transaction.symbol,
        price:
          currencyAmount && transaction.quantity
            ? Number(Math.abs(currencyAmount / transaction.quantity).toFixed(3))
            : 0,
        type: normalizedType,
        amount: Math.abs(amount),
        currencyAmount: currencyAmount ?? 0,
        currency: transaction.security ? transaction.security.currency : 'USD',
        shares: normalizedShares,
        fees: transaction.fee,
        description: transaction.description,
        splitRatio,
        originalType: transaction.type,
        securityType: transaction.security?.type,
        security: {
          ...transaction.security,
          institution: transaction.institution,
          investment: transaction.investment,
        },
        note: transaction.note,
      };

      return _transaction;
    })
    .sort((a: any, b: any) => a.date.valueOf() - b.date.valueOf());
};

export const parseAccountTransactionsResponse = (response: any, currencies: Currencies): AccountTransaction[] => {
  return response
    .filter((t: any) => !t.deleted && t.type)
    .filter(
      (transaction: any) =>
        (!(transaction.security || transaction.symbol) &&
          ['income', 'interest', 'deposit', 'withdrawal', 'transfer', 'fee'].includes(
            transaction.type.toLowerCase(),
          )) ||
        isSecuritiesAccountsTransfer(transaction),
    )
    .map((transaction: any) => {
      const date = getDate(transaction.date);
      let currencyAmountValue = Number(transaction.currency_amount);
      if (Number.isNaN(currencyAmountValue) || currencyAmountValue === undefined) {
        currencyAmountValue = 0;
      }
      const amount = currencies.getValue(getInvestmentCurrency(transaction.investment), currencyAmountValue, date);

      return {
        id: transaction.id,
        date,
        account: transaction.investment,
        amount,
        type: transaction.type,
        description: transaction.description,
      };
    });
};

export const parsePositionsResponse = (response: any): Position[] => {
  return response.filter((position: any) => position.market_value >= 0.5).map((position: any) => position as Position);
};
