import { DATE_FORMAT } from './constants';
import { Currencies } from './context/CurrencyContext';
import { Account, AccountTransaction, CashFlow, Position, Transaction } from './types';
import { getDate, getSymbol, normalizeAccountType } from './utils';

//
// We can properly move the securities from one account to another by marking the description or notes
// as accounts transfer, this is a manual work to handle the securities transfer since the amounts need
// to be adjusted anyway.
//
const isSecuritiesAccountsTransfer = (transaction: any) =>
  transaction.type &&
  transaction.type.toLowerCase() === 'transfer' &&
  ((transaction.description && transaction.description.startsWith('[Accounts Transfer]')) ||
    (transaction.note && transaction.note.includes('Accounts Transfer')));

export const parseCurrencyReponse = (response: any) => {
  const date = getDate(response.from);
  return response.data.reduce((hash, value) => {
    if (!!value) {
      hash[date.format(DATE_FORMAT)] = Number(value);
    }
    // Move the date forward.
    date.add(1, 'days');
    return hash;
  }, {});
};

export const parseGroupNameByIdReponse = (response: any): { [K: string]: string } =>
  (response || []).reduce((hash, group) => {
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
    .filter((institution) => !institutions || !institutions.length || institutions.includes(institution.id))
    .reduce((accounts, instutition) => {
      return accounts.concat(
        instutition.investments
          .filter((account) => isValidAccountGroup(groups, account.groups) && !account.ignored)
          .map((account) => {
            return {
              id: account._id,
              institution: instutition.id,
              instutitionName: instutition.name,
              name: `${instutition.name} ${account.name}`,
              created_at: getDate(instutition.creation_date),
              type: normalizeAccountType(
                account.type
                  ? account.type
                  : account.name && account.name.includes('-')
                  ? account.name.split('-')[1].trim()
                  : account.name,
              ),
              groups: account.groups,
              cash: account.cash,
              value: account.value,
              currency_value: account.currency_value,
              currency: account.currency,
              positions: (account.positions || []).map((position) => ({
                ...position,
                symbol: getSymbol(position.security),
              })),
            };
          }),
      );
    }, accounts);
};

export const parsePortfolioResponse = (response: any) => {
  const data = response.history.total;

  let date = getDate(data.from);
  return data.data.reduce((hash, value) => {
    if (value !== null && value !== undefined) {
      hash[date.format(DATE_FORMAT)] = Number(value);
    }

    // Move the date forward.
    date = date.add(1, 'days');
    return hash;
  }, {});
};

const getInvestmentCurrency = (investment: string) => {
  const currency = investment && investment.includes(':') && investment.split(':').pop();
  return currency && currency.length === 3 ? currency : 'cad';
};

export const computeCashFlowByDate = (response: any, currencies: Currencies): { [K: string]: CashFlow } => {
  return response
    .filter((t) => !t.deleted)
    .reduce((hash, transaction) => {
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
          };

      const amount = currencies.getValue(
        getInvestmentCurrency(transaction.investment),
        Number(transaction.currency_amount),
        date,
      );

      if (['deposit'].includes(type)) {
        portfolioData.deposit += amount;
      } else if (type === 'transfer') {
        if (
          isSecuritiesAccountsTransfer(transaction) ||
          // FX and journal over shouldn't be treated as deposits.
          (!['FXT', 'BRW', 'ExchTrade'].includes(transaction.origin_type) &&
            //
            // Ignore security transfers...
            // When the securities are transfered from one account to another, we will get to know the value of the
            // security at the time of the transfer. So counting that into deposits will screw up the deposits calculation.
            //
            // https://github.com/mani-coder/wealthica-addons/pull/5#issuecomment-876010402
            //
            !transaction.symbol)
        ) {
          portfolioData.deposit += amount;
        }
      } else if (['fee', 'interest', 'tax', 'income', 'dividend', 'distribution'].includes(type)) {
        if (amount > 0) {
          portfolioData.income += amount;
        } else {
          portfolioData.interest += Math.abs(amount);
        }
      } else if (type === 'withdrawal') {
        portfolioData.withdrawal += Math.abs(amount);
      } else {
        console.debug('Unhandled type', type);
      }
      hash[dateKey] = portfolioData;
      return hash;
    }, {});
};

export const parseSecurityTransactionsResponse = (response: any, currencies: Currencies): Transaction[] => {
  return response
    .filter((t) => !t.deleted && t.type)
    .filter(
      (transaction) =>
        (['sell', 'buy', 'income', 'dividend', 'distribution', 'tax', 'fee', 'split', 'reinvest'].includes(
          transaction.type.toLowerCase(),
        ) ||
          isSecuritiesAccountsTransfer(transaction)) &&
        (transaction.security || transaction.symbol),
    )
    .map((transaction) => {
      const date = getDate(transaction.date);

      const amount = currencies.getValue(
        getInvestmentCurrency(transaction.investment),
        Number(transaction.currency_amount),
        date,
      );

      let splitRatio;
      if (transaction.type === 'split' && transaction.description?.includes('@')) {
        const match = transaction.description.match(/@([0-9]+):([0-9]+)/);
        if (match && match[1]) {
          splitRatio = parseInt(match[2]) / parseInt(match[1]);
        }
      }

      const currencyAmount = transaction.currency_amount
        ? Math.abs(transaction.currency_amount + (transaction.fee || 0) * (transaction.type === 'buy' ? 1 : -1))
        : undefined;

      const _transaction: Transaction = {
        date,
        id: transaction.id,
        account: transaction.investment,
        symbol: transaction.security ? getSymbol(transaction.security) : transaction.symbol,
        ticker: transaction.security ? getSymbol(transaction.security, true) : transaction.symbol,
        price:
          currencyAmount && transaction.quantity
            ? Number(Math.abs(currencyAmount / transaction.quantity).toFixed(3))
            : 0,
        type: isSecuritiesAccountsTransfer(transaction) ? (amount < 0 ? 'sell' : 'buy') : transaction.type,
        amount: Math.abs(amount),
        currencyAmount: currencyAmount ?? 0,
        currency: transaction.security ? transaction.security.currency : 'USD',
        shares: transaction.quantity ?? 0,
        fees: transaction.fee,
        description: transaction.description,
        splitRatio,
        originalType: transaction.type,
        securityType: transaction.security?.type,
      };

      return _transaction;
    })
    .sort((a, b) => a.date.valueOf() - b.date.valueOf());
};

export const parseAccountTransactionsResponse = (response: any, currencies: Currencies): AccountTransaction[] => {
  return response
    .filter((t) => !t.deleted && t.type)
    .filter(
      (transaction) =>
        (!(transaction.security || transaction.symbol) &&
          ['income', 'interest', 'deposit', 'withdrawal', 'transfer', 'fee'].includes(
            transaction.type.toLowerCase(),
          )) ||
        isSecuritiesAccountsTransfer(transaction),
    )
    .map((transaction) => {
      const date = getDate(transaction.date);
      const amount = currencies.getValue(
        getInvestmentCurrency(transaction.investment),
        Number(transaction.currency_amount),
        date,
      );

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
  return response.map((position) => position as Position);
};
