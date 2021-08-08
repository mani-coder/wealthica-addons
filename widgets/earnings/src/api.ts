import type { Position } from 'types';

export const parsePositionsResponse = (response: any): Position[] => {
  return response.map((position) => {
    const security = position.security;
    return {
      name: security.name,
      symbol: position.security.currency === 'cad' ? `${security.symbol}.TO` : security.symbol,
      type: security.type,
      events: [],
      ticker: position.security.currency === 'cad' ? `TSE:${security.symbol}` : security.symbol,
    };
  });
};
