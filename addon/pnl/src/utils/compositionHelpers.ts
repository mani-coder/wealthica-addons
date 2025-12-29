import { Account } from '../types';

export type GroupType = 'type' | 'accounts' | 'institution' | 'currency';

export function getGroupKey(group: GroupType, account?: Account) {
  if (!account) {
    return 'N/A';
  }

  switch (group) {
    case 'currency':
      return account.currency.toUpperCase();
    case 'type':
      return account.type;
    case 'institution':
      return account.instutitionName;
    default:
      return account.name;
  }
}
