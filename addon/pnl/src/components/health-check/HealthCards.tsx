import { Empty, Masonry } from 'antd';
import type { MasonryItemType } from 'antd/es/masonry/MasonryItem';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { HoldingHealthReport } from '../../types/healthCheck';
import { HealthCard } from './HealthCard';

interface HealthCardsProps {
  reports: HoldingHealthReport[];
}

export const HealthCards: React.FC<HealthCardsProps> = ({ reports }) => {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const expandedCardRef = useRef<HTMLDivElement>(null);

  // Convert reports to Masonry items
  const items: MasonryItemType<HoldingHealthReport>[] = reports.map((report) => ({
    key: report.symbol,
    data: report,
  }));

  const handleCardClick = (symbol: string) => {
    setExpandedCard((prev) => (prev === symbol ? null : symbol));
  };

  // Scroll to expanded card when it appears
  useEffect(() => {
    if (expandedCard && expandedCardRef.current) {
      // Small delay to ensure the card is rendered
      setTimeout(() => {
        expandedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
      }, 100);
    }
  }, [expandedCard]);

  const expandedReport = reports.find((r) => r.symbol === expandedCard);

  if (reports.length === 0) {
    return <Empty description="No holdings match the selected filters" />;
  }

  return (
    <div className="relative">
      {/* Expanded Card Overlay */}
      {expandedCard && expandedReport && (
        <div ref={expandedCardRef} className="my-4">
          <HealthCard report={expandedReport} expanded onClick={() => setExpandedCard(null)} />
        </div>
      )}

      {/* Masonry Grid - Only show tiles */}
      <Masonry
        items={items}
        columns={{
          xs: 1,
          sm: 2,
          md: 3,
          lg: 4,
          xl: 5,
          xxl: 6,
        }}
        gutter={16}
        itemRender={({ data: report }) => {
          // Only render tile view in masonry
          return (
            <HealthCard
              key={report.symbol}
              report={report}
              expanded={false}
              onClick={() => handleCardClick(report.symbol)}
            />
          );
        }}
      />
    </div>
  );
};
