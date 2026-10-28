import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Native <dialog>: focus trap, Esc and backdrop for free. `side` renders it as a drawer. */
export function Dialog({ open, onClose, title, children, side = false, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${side ? "drawer" : "modal"}${wide ? " wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Zamknij">
            ×
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="segmented">
      <legend>{label}</legend>
      <div>
        {options.map(([v, text]) => (
          <label key={v} className={v === value ? "on" : undefined}>
            <input type="radio" checked={v === value} onChange={() => onChange(v)} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// --- toast: one readable message after each action ---

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);
  const show = useCallback((text: string) => setMessage({ text, key: Date.now() }), []);
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [message]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-slot" role="status" aria-live="polite">
        <AnimatePresence>
          {message && (
            <motion.p
              key={message.key}
              className="toast"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Logo picker: shows the logo on a light band (as on the TV), uploads on choose, can remove. */
export function LogoField({ label, hint, value, onUpload, onRemove }: {
  label: string;
  hint: string;
  value: string | null;
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError("");
    setError((await action()) ?? "");
    setBusy(false);
  };
  return (
    <div className="field logo-field">
      <label htmlFor={id}>{label}</label>
      <div className="logo-row">
        <div className="logo-band">{value ? <img src={value} alt="" /> : <span>Brak logo</span>}</div>
        <div className="logo-actions">
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) run(() => onUpload(file));
            }}
          />
          {value && (
            <button type="button" className="btn quiet" disabled={busy} onClick={() => run(onRemove)}>
              Usuń logo
            </button>
          )}
        </div>
      </div>
      {busy && <p className="hint">Wgrywanie…</p>}
      {error && <p className="error">{error}</p>}
      <p className="hint">{hint}</p>
    </div>
  );
}

const dayMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("pl-PL", { day: "numeric", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("pl-PL", { weekday: "short", timeZone: "UTC" });
const utcNoon = (d: string) => new Date(`${d}T12:00:00Z`);

/** "9–11 października", "30 września – 2 października", "10 października". */
export function dateRange(first: string, last: string): string {
  if (first === last) return dayMonth.format(utcNoon(first));
  if (first.slice(0, 7) === last.slice(0, 7)) return `${dayOnly.format(utcNoon(first))}–${dayMonth.format(utcNoon(last))}`;
  return `${dayMonth.format(utcNoon(first))} – ${dayMonth.format(utcNoon(last))}`;
}

export function dayTab(date: string): { weekday: string; date: string } {
  const w = weekdayShort.format(utcNoon(date)).replace(".", "");
  return { weekday: w.charAt(0).toUpperCase() + w.slice(1), date: `${Number(date.slice(8))}.${date.slice(5, 7)}` };
}
