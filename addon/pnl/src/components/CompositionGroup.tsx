import { Radio, Typography } from 'antd';
import { useMemo } from 'react';
import { trackEvent } from '../analytics';
import type { GroupType } from '../utils/compositionHelpers';

type Props = {
  group?: GroupType;
  changeGroup: (group: GroupType) => void;
  tracker: string;
  excludedGroups?: GroupType[];
};

export default function CompositionGroup({ group = 'currency', changeGroup, tracker, excludedGroups = [] }: Props) {
  const options = useMemo(() => {
    return [
      { label: 'Currency', value: 'currency' },
      { label: 'Account Type', value: 'type' },
      { label: 'Institution', value: 'institution' },
      { label: 'Account', value: 'accounts' },
      { label: 'Sector', value: 'sector' },
    ].filter((option) => !excludedGroups.includes(option.value as GroupType));
  }, [excludedGroups]);

  return (
    <div className="flex w-full flex-col items-center">
      <Typography.Title level={4}>Group By</Typography.Title>
      <Radio.Group
        optionType="button"
        buttonStyle="solid"
        defaultValue={group}
        onChange={(e) => {
          changeGroup(e.target.value);
          trackEvent(tracker, { group: e.target.value });
        }}
        options={options}
      />
    </div>
  );
}
