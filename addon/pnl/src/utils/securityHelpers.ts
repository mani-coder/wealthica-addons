import type { Position, Security, SecurityType } from '../types';

/**
 * Detect if a security is a cryptocurrency
 * Checks the security.type field which will be "crypto" for crypto securities
 */
export function isCryptoSecurity(security: Security): boolean {
  return security.type?.toLowerCase() === 'crypto';
}

/**
 * Detect if a position is a cryptocurrency
 * Checks the position's security.type field
 */
export function isCrypto(position: Position): boolean {
  return isCryptoSecurity(position.security);
}

/**
 * Detect if a position is a fund (ETF or mutual fund)
 * These types have sector weightings that can be distributed across sectors
 */
export function isFund(position: Position): boolean {
  return position.type === 'etf' || position.type === 'mutual_fund';
}

/**
 * Map Yahoo Finance quoteType to our SecurityType
 * Used when enriching positions with data from Yahoo Finance API
 */
export function mapQuoteTypeToSecurityType(quoteType: string): SecurityType {
  const normalizedType = quoteType.toUpperCase();
  switch (normalizedType) {
    case 'ETF':
      return 'etf';
    case 'MONEYMARKET':
      return 'money_market';
    case 'MUTUALFUND':
      return 'mutual_fund';
    case 'EQUITY':
      return 'equity';
    default:
      return 'equity'; // Default to equity for stocks
  }
}
