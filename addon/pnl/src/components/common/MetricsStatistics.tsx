/**
 * MetricsStatistics Component
 *
 * Reusable component for displaying metrics with tooltips.
 * Used across Performance Metrics and Health Check features.
 */

import { QuestionCircleOutlined } from '@ant-design/icons';
import { Statistic, type StatisticProps, Tooltip } from 'antd';

export function MetricsStatistics(props: StatisticProps & { tooltip?: string }) {
  const titleClass = 'text-xs font-semibold text-gray-500';
  return (
    <Statistic
      {...props}
      valueRender={(value) => <span className="text-lg font-semibold">{value}</span>}
      title={
        props.tooltip ? (
          <Tooltip title={props.tooltip}>
            <span className={titleClass}>
              {props.title} <QuestionCircleOutlined className="text-[10px] text-slate-500" />
            </span>
          </Tooltip>
        ) : (
          <span className={titleClass}>{props.title}</span>
        )
      }
    />
  );
}
