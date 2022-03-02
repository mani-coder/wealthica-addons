import { message } from 'antd';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useReactToPrint } from 'react-to-print';

export type Props = { title: string; children: React.ReactNode };

export function usePrint({ title, children }: Props) {
  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
    documentTitle: title,
    onAfterPrint: () => setPrinting(false),
    onPrintError: () => {
      message.error('Failed to print component.');
      setPrinting(false);
    },
  });
  const [printing, setPrinting] = useState(false);

  const componentRef = useRef<HTMLDivElement>(null);

  const component = useMemo(() => {
    return <div ref={componentRef}>{children}</div>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const print = useCallback(
    (render?: boolean) => {
      setPrinting(true);

      if (render) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ReactDOM.render(component, document.getElementById('pnl-addon-printable-content')!);
      }

      setTimeout(() => handlePrint(), 50);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { print, component, printing };
}
