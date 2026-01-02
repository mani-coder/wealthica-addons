import { DATE_FORMAT } from './constants';
import type { Account } from './types';
import { getCurrencyInCAD, getDate, getSymbol } from './utils';

export function parseCurrencyReponse(response: any) {
  const date = getDate(response.from);
  return response.data.reduce((hash, value) => {
    if (value) {
      hash[date.format(DATE_FORMAT)] = Number(value);
    }
    // Move the date forward.
    date.add(1, 'days');
    return hash;
  }, {});
}

const isSecuritiesAccountsTransfer = (transaction: any) =>
  transaction.type &&
  transaction.type.toLowerCase() === 'transfer' &&
  (transaction.description?.startsWith('[Accounts Transfer]') ||
    (transaction.notes && transaction.notes === 'Accounts Transfer'));

export function parseInstitutionsResponse(response: any, groups?: string[], institutions?: string[]): Account[] {
  const accounts: Account[] = [];
  return response
    .filter((institution) => !institutions || !institutions.length || institutions.includes(institution.id))
    .reduce((accounts, instutition) => {
      return accounts.concat(
        instutition.investments
          .filter((account) => (!groups || !groups.length || groups.includes(account.group)) && !account.ignored)
          .map((account) => {
            return {
              id: account._id,
              institution: instutition.id,
              name: instutition.name,
              created_at: getDate(instutition.creation_date),
              type: account.name?.includes('-') ? account.name.split('-')[1].trim() : account.name,
              group: account.group,
              cash: account.cash,
              value: account.value,
              currency: account.currency,
              positions: (account.positions || []).map((position) => ({
                ...position,
                symbol: getSymbol(position.security),
              })),
            };
          }),
      );
    }, accounts);
}

export function parsePortfolioResponse(response: any) {
  const data = response.history.total;
  const date = getDate(data.from);
  return data.data.reduce((hash, value) => {
    if (value) {
      hash[date.format(DATE_FORMAT)] = Number(value);
    }

    // Move the date forward.
    date.add(1, 'days');
    return hash;
  }, {});
}

export function parseTransactionsResponse(response: any, currencyCache: any, accounts: Account[]) {
  return response
    .filter((t) => !t.deleted)
    .reduce((hash, transaction) => {
      const type = transaction.type;
      if (['sell', 'buy', 'unknown', 'split', 'reinvest'].includes(type)) {
        return hash;
      }

      let date = getDate(transaction.date);
      if (['deposit', 'transfer', 'withdrawal'].includes(type)) {
        // adjust the date of transaction, so that portfolio isn't screw'd up.
        const account = accounts.find((account) => account.institution === transaction.institution);
        if (account && account.created_at > date) {
          // console.debug('Aligning transaction date with the account creation date', account, transaction);
          date = account.created_at;
        }
      }

      const dateKey = date.format(DATE_FORMAT);
      const portfolioData = hash[dateKey]
        ? hash[dateKey]
        : {
            deposit: 0,
            withdrawal: 0,
            interest: 0,
            income: 0,
          };

      let amount = Number(transaction.currency_amount);
      amount = transaction.investment?.includes(':usd') ? getCurrencyInCAD(date, amount, currencyCache) : amount;

      if (['deposit'].includes(type)) {
        portfolioData.deposit += amount;
      } else if (type === 'transfer') {
        if (isSecuritiesAccountsTransfer(transaction) || !['FXT', 'ExchTrade'].includes(transaction.origin_type)) {
          portfolioData.deposit += amount;
        }
      } else if (['fee', 'interest', 'tax'].includes(type)) {
        portfolioData.interest += Math.abs(amount);
      } else if (['income', 'dividend', 'distribution'].includes(type)) {
        portfolioData.income += amount;
      } else if (type === 'withdrawal') {
        portfolioData.withdrawal += Math.abs(amount);
      } else {
        console.debug('Unhandled type', type);
      }
      hash[dateKey] = portfolioData;
      return hash;
    }, {});
}
