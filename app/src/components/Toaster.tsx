import { useEffect, useState } from 'react';
import { faCircleCheck, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { onToast, type ToastMessage } from '../lib/toast';
import { Fa } from './Fa';

// The corner message from lib/toast.ts, shown for 4.5 seconds.
export function Toaster() {
  const [shown, setShown] = useState<ToastMessage | null>(null);
  useEffect(() => {
    let timer = 0;
    const off = onToast((t) => {
      setShown(t);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShown(null), 4500);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);
  if (!shown) return null;
  return (
    <div className="nl-toast" role="status" aria-live="polite">
      <Fa icon={shown.kind === 'info' ? faCircleInfo : faCircleCheck} className={shown.kind === 'info' ? 'nl-toast-info' : 'nl-toast-done'} />
      <span>{shown.text}</span>
    </div>
  );
}
