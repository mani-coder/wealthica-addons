import { Collapse } from 'antd';
import { trackEvent } from '../analytics';

export default function Collapsible({
  title,
  closed,
  children,
}: {
  closed?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-6 w-full mb-2">
      <Collapse
        defaultActiveKey={closed ? [] : ['1']}
        expandIconPlacement="end"
        onChange={() => trackEvent('collapse-panel', { title })}
      >
        <Collapse.Panel header={title} key="1" style={{ backgroundColor: '#d1fae5' }}>
          {children}
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
