import { ToolOutlined } from '@ant-design/icons';
import { Result } from 'antd';

export default function MaintenanceResult() {
  return (
    <div className="flex justify-center items-center py-12">
      <Result
        icon={<ToolOutlined />}
        title="Under Maintenance"
        subTitle="This feature is currently under maintenance. We'll be back soon!"
      />
    </div>
  );
}
