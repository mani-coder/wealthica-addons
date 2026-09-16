import type { Position } from '../types';
import { getSymbol } from './common';

export type PortfolioReviewCategory = 'data' | 'cost_basis' | 'concentration' | 'allocation';
export type PortfolioReviewTone = 'error' | 'warning' | 'info';

export type PortfolioReviewReason = {
  category: PortfolioReviewCategory;
  label: string;
  detail: string;
  tone: PortfolioReviewTone;
};

export type PortfolioReviewItem = {
  symbol: string;
  name: string;
  position: Position;
  portfolioWeight: number;
  returnVsCostBasis: number | null;
  dataComplete: boolean;
  reasons: PortfolioReviewReason[];
  reviewPriority: number;
};

export type PortfolioReviewSummary = {
  items: PortfolioReviewItem[];
  holdingsReviewed: number;
  needsReview: number;
  dataGapCount: number;
  concentrationCount: number;
  belowCostBasisCount: number;
  smallAllocationCount: number;
};

export type PortfolioReviewThresholds = {
  smallAllocation: number;
  concentration: number;
  highConcentration: number;
  materialLoss: number;
};

export const DEFAULT_PORTFOLIO_REVIEW_THRESHOLDS: PortfolioReviewThresholds = {
  smallAllocation: 0.01,
  concentration: 0.15,
  highConcentration: 0.25,
  materialLoss: -20,
};

function hasFinitePositiveValue(value: number | undefined | null): boolean {
  return Number.isFinite(value) && Number(value) > 0;
}

/**
 * Build a transparent portfolio snapshot. Every review item is backed by a
 * field in the current position payload; this deliberately does not assign an
 * investment-quality score or generate a trade recommendation.
 */
export function buildPortfolioReview(
  positions: Position[],
  thresholds: PortfolioReviewThresholds = DEFAULT_PORTFOLIO_REVIEW_THRESHOLDS,
): PortfolioReviewSummary {
  const totalValue = positions.reduce(
    (total, position) => total + (Number.isFinite(position.market_value) ? Math.max(0, position.market_value) : 0),
    0,
  );

  const items = positions
    .map((position): PortfolioReviewItem => {
      const portfolioWeight =
        totalValue > 0 && Number.isFinite(position.market_value) ? position.market_value / totalValue : 0;
      const returnVsCostBasis = Number.isFinite(position.gain_percent) ? position.gain_percent * 100 : null;
      const reasons: PortfolioReviewReason[] = [];
      const symbol = getSymbol(position.security);

      if (!position.security?.symbol && !position.security?.name) {
        reasons.push({
          category: 'data',
          label: 'Missing identifier',
          detail: 'The position has no security symbol or name.',
          tone: 'error',
        });
      }
      if (!position.security?.currency) {
        reasons.push({
          category: 'data',
          label: 'Missing currency',
          detail: 'Currency is required for base-currency comparisons.',
          tone: 'error',
        });
      }
      if (!hasFinitePositiveValue(position.market_value)) {
        reasons.push({
          category: 'data',
          label: 'Market value unavailable',
          detail: 'A positive current market value was not supplied.',
          tone: 'error',
        });
      }
      if (!hasFinitePositiveValue(position.book_value)) {
        reasons.push({
          category: 'data',
          label: 'Cost basis unavailable',
          detail: 'Return versus cost basis cannot be validated for this holding.',
          tone: 'error',
        });
      }
      if (!hasFinitePositiveValue(position.quantity)) {
        reasons.push({
          category: 'data',
          label: 'Quantity unavailable',
          detail: 'A positive current quantity was not supplied.',
          tone: 'error',
        });
      }
      if (!position.transactions?.length) {
        reasons.push({
          category: 'data',
          label: 'No transaction history',
          detail: 'Holding-period and cash-flow analysis may be incomplete.',
          tone: 'warning',
        });
      }
      if (position.type === 'unknown' || !position.type) {
        reasons.push({
          category: 'data',
          label: 'Security type unresolved',
          detail: 'The holding could not be classified as a stock, fund, cash equivalent, or other asset.',
          tone: 'warning',
        });
      }

      if (returnVsCostBasis !== null && returnVsCostBasis < 0) {
        reasons.push({
          category: 'cost_basis',
          label: 'Below cost basis',
          detail: `${Math.abs(returnVsCostBasis).toFixed(1)}% below the recorded cost basis.`,
          tone: returnVsCostBasis <= thresholds.materialLoss ? 'error' : 'warning',
        });
      }
      if (portfolioWeight > thresholds.concentration) {
        reasons.push({
          category: 'concentration',
          label: 'Concentration threshold',
          detail: `${(portfolioWeight * 100).toFixed(1)}% of the current portfolio; review threshold is ${(thresholds.concentration * 100).toFixed(0)}%.`,
          tone: portfolioWeight > thresholds.highConcentration ? 'error' : 'warning',
        });
      }
      if (portfolioWeight > 0 && portfolioWeight < thresholds.smallAllocation) {
        reasons.push({
          category: 'allocation',
          label: 'Small allocation',
          detail: `${(portfolioWeight * 100).toFixed(2)}% of the current portfolio; review threshold is ${(thresholds.smallAllocation * 100).toFixed(0)}%.`,
          tone: 'info',
        });
      }

      const reviewPriority = reasons.reduce((priority, reason) => {
        const tonePriority = reason.tone === 'error' ? 3 : reason.tone === 'warning' ? 2 : 1;
        const categoryPriority = reason.category === 'data' ? 1 : 0;
        return Math.max(priority, tonePriority + categoryPriority);
      }, 0);
      return {
        symbol,
        name: position.security.name,
        position,
        portfolioWeight,
        returnVsCostBasis,
        dataComplete: !reasons.some((reason) => reason.category === 'data'),
        reasons,
        reviewPriority,
      };
    })
    .sort(
      (left, right) =>
        right.reviewPriority - left.reviewPriority ||
        right.portfolioWeight - left.portfolioWeight ||
        left.symbol.localeCompare(right.symbol),
    );

  return {
    items,
    holdingsReviewed: items.length,
    needsReview: items.filter((item) => item.reasons.length > 0).length,
    dataGapCount: items.filter((item) => item.reasons.some((reason) => reason.category === 'data')).length,
    concentrationCount: items.filter((item) => item.reasons.some((reason) => reason.category === 'concentration'))
      .length,
    belowCostBasisCount: items.filter((item) => item.reasons.some((reason) => reason.category === 'cost_basis')).length,
    smallAllocationCount: items.filter((item) => item.reasons.some((reason) => reason.category === 'allocation'))
      .length,
  };
}
