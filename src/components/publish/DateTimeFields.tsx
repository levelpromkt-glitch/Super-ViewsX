import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function parseDateString(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateLabel(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

// Next 5-minute mark at least ~10 minutes ahead, so the default is always valid.
export function defaultScheduleSlot() {
  const d = new Date(Date.now() + 10 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return { date: toDateString(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

function Popover({
  trigger,
  children,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void, open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dt-wrap" ref={ref}>
      {trigger(open, () => setOpen((v) => !v))}
      {open && <div className="dt-popover">{children(() => setOpen(false), open)}</div>}
    </div>
  );
}

function ScrollColumn({
  items,
  selected,
  onPick,
}: {
  items: number[];
  selected: number;
  onPick: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = ref.current;
    const el = list?.querySelector<HTMLElement>('[data-selected="true"]');
    if (list && el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
  }, []);

  return (
    <div className="dt-col" ref={ref}>
      {items.map((n) => (
        <button
          key={n}
          type="button"
          className={`dt-col-item${n === selected ? " selected" : ""}`}
          data-selected={n === selected}
          onClick={() => onPick(n)}
        >
          {pad(n)}
        </button>
      ))}
    </div>
  );
}

export function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hh, mm] = value.split(":").map(Number);
  return (
    <Popover
      trigger={(open, toggle) => (
        <button type="button" className={`dt-trigger${open ? " open" : ""}`} onClick={toggle}>
          <Clock size={14} />
          <span>{value}</span>
          <ChevronDown size={14} className="dt-chevron" />
        </button>
      )}
    >
      {() => (
        <div className="dt-time">
          <ScrollColumn items={HOURS} selected={hh} onPick={(h) => onChange(`${pad(h)}:${pad(mm)}`)} />
          <span className="dt-time-sep">:</span>
          <ScrollColumn items={MINUTES} selected={mm} onPick={(m) => onChange(`${pad(hh)}:${pad(m)}`)} />
        </div>
      )}
    </Popover>
  );
}

function Calendar_({
  value,
  min,
  onPick,
}: {
  value: string;
  min: string;
  onPick: (v: string) => void;
}) {
  const selected = parseDateString(value);
  const [view, setView] = useState({ year: selected.getFullYear(), month: selected.getMonth() });
  const today = toDateString(new Date());

  const first = new Date(view.year, view.month, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(view.year, view.month, 1 - first.getDay() + i));

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="dt-cal">
      <div className="dt-cal-head">
        <button type="button" className="dt-cal-nav" onClick={() => shift(-1)} aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <strong>{MONTHS[view.month]} / {view.year}</strong>
        <button type="button" className="dt-cal-nav" onClick={() => shift(1)} aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="dt-cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="dt-cal-weekday">{w}</span>
        ))}
        {cells.map((d) => {
          const str = toDateString(d);
          const outside = d.getMonth() !== view.month;
          const disabled = str < min;
          return (
            <button
              key={str}
              type="button"
              disabled={disabled}
              className={`dt-cal-day${outside ? " outside" : ""}${str === value ? " selected" : ""}${str === today ? " today" : ""}`}
              onClick={() => onPick(str)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const min = toDateString(new Date());
  return (
    <Popover
      trigger={(open, toggle) => (
        <button type="button" className={`dt-trigger${open ? " open" : ""}`} onClick={toggle}>
          <Calendar size={14} />
          <span>{formatDateLabel(value)}</span>
          <ChevronDown size={14} className="dt-chevron" />
        </button>
      )}
    >
      {(close) => (
        <Calendar_
          value={value}
          min={min}
          onPick={(v) => {
            onChange(v);
            close();
          }}
        />
      )}
    </Popover>
  );
}
