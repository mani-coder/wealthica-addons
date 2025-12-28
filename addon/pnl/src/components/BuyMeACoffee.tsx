import Heart from '@ant-design/icons/HeartFilled';
import { Button } from 'antd';
import { trackEvent } from '../analytics';

export default function BuyMeACoffee() {
  const text = 'Buy me a coffee';
  return (
    <div className="flex py-6 w-full justify-center mb-2">
      <Button
        href="https://ko-fi.com/manicoder"
        target="_blank"
        rel="noopener noreferrer"
        type="primary"
        size="large"
        onClick={() => trackEvent('buy-me-a-coffee', { text })}
        icon={<Heart />}
        style={{
          borderRadius: 64,
          fontWeight: 'bold',
          fontFamily: 'cursive',
          fontSize: 20,
          paddingLeft: 48,
          paddingRight: 48,
        }}
      >
        Buy me a coffee
      </Button>
    </div>
  );
}
