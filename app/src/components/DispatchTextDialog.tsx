import { useEffect, useRef, useState } from 'react';
import { faCircleExclamation, faRotateLeft, faSpinner, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { faPaperPlane } from '@fortawesome/free-regular-svg-icons';
import { sendText, twilioConnected } from '../lib/sms';
import { Fa } from './Fa';

interface DispatchTextDialogProps {
  driver: string;
  phone: string;
  // The load summary built from the form, and the notes it starts with.
  summary: () => string;
  notes: string;
  // Some details are not filled in yet (they show as TBD).
  incomplete: boolean;
  onSent: () => void;
  onClose: () => void;
}

// Dispatch to driver (New Load, release 1.21): the load summary as a text to
// the connected truck's driver, sent through the company's own provider
// (Settings › Integrations). Without one it asks to connect a provider.
export function DispatchTextDialog({ driver, phone, summary, notes: startNotes, incomplete, onSent, onClose }: DispatchTextDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(summary);
  const [notes, setNotes] = useState(startNotes);
  const [empty, setEmpty] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    const t = textRef.current;
    if (t) {
      t.scrollTop = 0;
      t.focus();
      t.setSelectionRange(0, 0);
    }
  }, []);

  const message = () => text.trim() + (notes.trim() ? `\n\nNOTES: ${notes.trim()}` : '');
  const len = message().length;
  const seg = len <= 160 ? 1 : Math.ceil(len / 153);

  const close = () => {
    ref.current?.close();
    onClose();
  };
  const send = async () => {
    if (sending) return;
    if (!text.trim()) {
      setEmpty(true);
      textRef.current?.focus();
      return;
    }
    if (!twilioConnected()) {
      setProblem('provider');
      return;
    }
    setSending(true);
    setProblem('');
    const error = await sendText(phone, message());
    setSending(false);
    if (error) {
      setProblem(error);
      return;
    }
    onSent();
    close();
  };

  return (
    <dialog
      ref={ref}
      className="nl-dp"
      aria-labelledby="nl-dp-title"
      aria-describedby="nl-dp-desc"
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); close(); }}
      onClose={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); }
      }}
    >
      <header className="nl-dp-head">
        <div className="nl-dp-head-left">
          <span className="nl-dp-ico"><Fa icon={faPaperPlane} /></span>
          <div>
            <h2 id="nl-dp-title" tabIndex={-1} className="nl-dp-title">Dispatch to driver</h2>
            <p id="nl-dp-desc" className="nl-dp-desc">Text message to <b>{driver} · {phone || 'no phone on file'}</b></p>
          </div>
        </div>
        <button type="button" className="nl-dp-x nl-fbtn" aria-label="Close without sending" onClick={close}><Fa icon={faXmark} /></button>
      </header>
      <div className="nl-dp-body">
        {incomplete && (
          <div className="nl-warn" style={{ marginTop: 0 }}>
            <Fa icon={faTriangleExclamation} />
            <span>Some load details aren't filled in yet and show as <b>TBD</b>. Edit them below or finish the form first.</span>
          </div>
        )}
        {problem && (
          <div className="nl-dp-provider" role="alert">
            <Fa icon={faCircleExclamation} />
            <span>{problem === 'provider' ? <><strong>Please connect to a provider.</strong> An admin can connect your Twilio account in Settings › Integrations.</> : problem}</span>
          </div>
        )}
        <div>
          <div className="nl-row-between">
            <label className="nl-lbl is-flush" htmlFor="nl-dp-summary">Load summary</label>
            <button type="button" className="nl-dp-reset nl-fbtn" onClick={() => { setText(summary()); setEmpty(false); textRef.current?.focus(); }}>
              <Fa icon={faRotateLeft} />Reset from form
            </button>
          </div>
          <textarea
            ref={textRef} id="nl-dp-summary" rows={10} className="nl-inp is-msg" value={text}
            aria-invalid={empty ? 'true' : 'false'} aria-describedby={empty ? 'nl-dp-err nl-dp-hint' : 'nl-dp-hint'}
            onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) setEmpty(false); }}
          />
          {empty && (
            <p id="nl-dp-err" className="nl-err"><Fa icon={faCircleExclamation} /><span>The message can't be empty — use "Reset from form" to rebuild it.</span></p>
          )}
          <p id="nl-dp-hint" className="nl-hint">Built from the form. Edits here only change this text message.</p>
        </div>
        <div>
          <label className="nl-lbl" htmlFor="nl-dp-notes">Notes <span className="nl-opt">(optional)</span></label>
          <textarea id="nl-dp-notes" rows={3} className="nl-inp is-msg" placeholder="e.g. Call the receiver 1 hour before arrival" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <p className="nl-hint">Pre-filled from Notes to carrier and Directions.</p>
        </div>
      </div>
      <footer className="nl-dp-foot">
        <p className="nl-dp-count" aria-live="polite">{len} characters · sends as {seg} text{seg > 1 ? 's' : ''}</p>
        <div className="nl-foot-btns" style={{ gap: 8 }}>
          <button type="button" className="nl-btn-ghost nl-fbtn" onClick={close}>Cancel</button>
          <button type="button" className="nl-btn-main nl-dp-send nl-fbtn" disabled={sending} onClick={() => void send()}>
            {sending ? <><Fa icon={faSpinner} spin /><span>Sending…</span></> : <><Fa icon={faPaperPlane} /><span>Send text</span></>}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
