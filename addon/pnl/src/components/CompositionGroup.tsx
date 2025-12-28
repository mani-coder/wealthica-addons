import { Radio, Typography } from 'antd';

import { trackEvent } from '../analytics';
import { Account } from '../types';

export type GroupType = 'type' | 'accounts' | 'institution' | 'currency';

type Props = {
  group?: GroupType;
  changeGroup: (group: GroupType) => void;
  tracker: string;
};

export default function CompositionGroup({ group = 'currency', changeGroup, tracker }: Props) {
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
        options={[
          { label: 'Currency', value: 'currency' },
          { label: 'Account Type', value: 'type' },
          { label: 'Institution', value: 'institution' },
          { label: 'Account', value: 'accounts' },
        ]}
      />
    </div>
  );
}

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
