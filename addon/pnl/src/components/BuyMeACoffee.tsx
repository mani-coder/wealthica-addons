import React from 'react';
import { Flex } from 'rebass';
import { trackEvent } from '../analytics';

export default function BuyMeACoffee() {
  const text = 'Buy me a coffee';
  return (
    <Flex py={3} width={1} justifyContent="center">
      <a
        target="_blank"
        rel="noreferrer noopener"
        href="https://www.buymeacoffee.com/youngkbell"
        onClick={() => trackEvent('buy-me-a-coffee', { text })}
      >
        <img
          alt="Buy Me A Coffee"
          src={`https://img.buymeacoffee.com/button-api/?text=${text}&emoji=❤️&slug=youngkbell&button_colour=BD5FFF&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00`}
        />
      </a>
    </Flex>
  );
}
