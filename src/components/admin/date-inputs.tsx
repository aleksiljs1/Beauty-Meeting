"use client";

import { useState, type Ref } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDayInput, isCalendarDay, maskDigits, parseDayInput, parseTimeInput } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { admin } from "@/i18n/admin";

/**
 * Date and time fields written the Albanian way (28/10/2026, 17:30) whatever the browser's
 * language, unlike <input type="date">, which follows the browser (10/28/2026 in English). Values
 * stay in the usual form ("YYYY-MM-DD", "HH:MM", "YYYY-MM-DDTHH:MM"); while the text isn't a real
 * date yet the field passes the text itself on, so the form's validation reports it.
 */

const t = admin.dateInput;

/** What FormField / react-hook-form hand to a control. */
type ControlProps = {
  ref?: Ref<HTMLInputElement>;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  onBlur?: () => void;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  className?: string;
};

const dayText = (value: string) => (isCalendarDay(value) ? formatDayInput(value) : value);
const dayValue = (text: string) => parseDayInput(text) ?? text.trim();
const timeValue = (text: string) => parseTimeInput(text) ?? text.trim();
/** "1/5/2026" → "01/05/2026" once the admin leaves the field. */
const tidyDay = (text: string) => {
  const day = parseDayInput(text);
  return day ? formatDayInput(day) : text;
};

/**
 * The text being typed, kept in step with `value`: when the value changes from outside (a reset,
 * another field filling this one in) the text follows; while the admin types, it's left alone.
 */
function useTypedText<T>(value: string, toText: (value: string) => T, toValue: (text: T) => string) {
  const [text, setText] = useState(() => toText(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== toValue(text)) setText(toText(value));
  }
  return [text, setText] as const;
}

/** The browser's own calendar, opened from the icon; the date it picks is written into the field. */
function CalendarButton({ day, min, max, disabled, onPick }: { day: string; min?: string; max?: string; disabled?: boolean; onPick: (day: string) => void }) {
  return (
    <span className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground">
      <CalendarDays className="size-4" aria-hidden />
      <input
        type="date"
        tabIndex={-1}
        aria-label={t.pick}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        value={isCalendarDay(day) ? day : ""}
        min={min}
        max={max}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker();
          } catch {
            // Already open, or a browser without showPicker: tapping the field opens it there.
          }
        }}
        onChange={(event) => event.target.value && onPick(event.target.value)}
      />
    </span>
  );
}

/** A day, "YYYY-MM-DD". `min` / `max` limit the calendar; the form's validation enforces them. */
export function DateInput({ value, onChange, min, max, className, ...control }: ControlProps & { value: string; onChange: (value: string) => void; min?: string; max?: string }) {
  const [text, setText] = useTypedText(value, dayText, dayValue);
  const change = (next: string) => {
    setText(next);
    onChange(dayValue(next));
  };
  return (
    <div className={cn("relative", className)}>
      <Input
        {...control}
        value={text}
        onChange={(event) => change(maskDigits(event.target.value, [2, 2, 4], "/"))}
        onBlur={() => {
          setText(tidyDay(text));
          control.onBlur?.();
        }}
        placeholder={t.datePlaceholder}
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        className="pr-9"
      />
      <CalendarButton day={dayValue(text)} min={min} max={max} disabled={control.disabled} onPick={(day) => change(formatDayInput(day))} />
    </div>
  );
}

/** A 24-hour time of day, "HH:MM". */
export function TimeInput({ value, onChange, className, ...control }: ControlProps & { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useTypedText(value, (v) => v, timeValue);
  return (
    <Input
      {...control}
      value={text}
      onChange={(event) => {
        const next = maskDigits(event.target.value, [2, 2], ":");
        setText(next);
        onChange(timeValue(next));
      }}
      placeholder={t.timePlaceholder}
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      className={cn("tabular-nums", className)}
    />
  );
}

type DayAndTime = { day: string; time: string };
const splitValue = (value: string): DayAndTime => {
  const [day = "", time = ""] = value.split("T");
  return { day: dayText(day), time };
};
const joinValue = ({ day, time }: DayAndTime) => (day.trim() || time.trim() ? `${dayValue(day)}T${timeValue(time)}` : "");

/** A day and time, "YYYY-MM-DDTHH:MM" (the same value <input type="datetime-local"> has). */
export function DateTimeInput({
  value,
  onChange,
  min,
  max,
  className,
  ...control
}: ControlProps & { value: string; onChange: (value: string) => void; min?: string; max?: string }) {
  const [text, setText] = useTypedText(value, splitValue, joinValue);
  const change = (next: DayAndTime) => {
    setText(next);
    onChange(joinValue(next));
  };
  return (
    <div className={cn("flex gap-2", className)}>
      <div className="relative min-w-0 flex-1">
        <Input
          {...control}
          value={text.day}
          onChange={(event) => change({ ...text, day: maskDigits(event.target.value, [2, 2, 4], "/") })}
          onBlur={() => {
            setText({ ...text, day: tidyDay(text.day) });
            control.onBlur?.();
          }}
          placeholder={t.datePlaceholder}
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="pr-9"
        />
        <CalendarButton day={dayValue(text.day)} min={min?.slice(0, 10)} max={max?.slice(0, 10)} disabled={control.disabled} onPick={(day) => change({ ...text, day: formatDayInput(day) })} />
      </div>
      <Input
        id={control.id ? `${control.id}-time` : undefined}
        aria-label={t.time}
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        disabled={control.disabled}
        onBlur={control.onBlur}
        value={text.time}
        onChange={(event) => change({ ...text, time: maskDigits(event.target.value, [2, 2], ":") })}
        placeholder={t.timePlaceholder}
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        className="w-20 shrink-0 tabular-nums"
      />
    </div>
  );
}
