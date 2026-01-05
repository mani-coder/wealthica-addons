import type { Account, Position } from '../types';

export type GroupType = 'type' | 'accounts' | 'institution' | 'currency' | 'sector';

export function getGroupKey(group: GroupType, account?: Account, position?: Position): string {
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
    case 'sector':
      return position?.sector || 'Unknown';
    default:
      return account.name;
  }
}
