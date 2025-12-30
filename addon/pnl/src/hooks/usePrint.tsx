import { message } from 'antd';
import { useCallback, useMemo, useRef, useState } from 'react';
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
    removeAfterPrint: true,
  });
  const [printing, setPrinting] = useState(false);

  const componentRef = useRef<HTMLDivElement>(null);

  const component = useMemo(() => {
    return <div ref={componentRef}>{children}</div>;
  }, [children]);

  const print = useCallback(
    (render?: boolean) => {
      setPrinting(true);

      if (render) {
        const printableElement = document.getElementById('pnl-addon-printable-content');
        if (printableElement) {
          ReactDOM.render(component, printableElement);
        }
      }

      setTimeout(() => handlePrint(), 50);
    },
    [component, handlePrint],
  );

  return { print, component, printing };
}
