import { CloseOutlined } from '@ant-design/icons';
import { Button } from 'antd';

interface CloseButtonProps {
  onClick: () => void;
}

export const CloseButton: React.FC<CloseButtonProps> = ({ onClick }) => {
  return (
    <Button
      className="mx-2"
      variant="outlined"
      type="primary"
      icon={<CloseOutlined />}
      onClick={onClick}
      size="small"
      aria-label="Close"
    />
  );
};
