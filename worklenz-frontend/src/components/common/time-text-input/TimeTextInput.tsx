import React, { forwardRef, useEffect, useRef, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Input, InputRef } from '@/shared/antd-imports';
import { formatTime, isCompleteTimeText, parseTimeText } from '@/utils/time-text-input';

interface TimeTextInputProps {
  /** Same value shape as antd's TimePicker, so it can replace it inside Form.Item. */
  value?: Dayjs | null;
  onChange?: (value: Dayjs | null) => void;
  /** Called once a full time has been typed (e.g. `1131`), to move focus to the next field. */
  onComplete?: () => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
  status?: '' | 'error' | 'warning';
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * Typed clock-time field (Clockify style) instead of a dropdown picker: accepts `1131`,
 * `931`, `11:31`, ... and normalizes to `HH:mm` on blur or Enter.
 */
export const TimeTextInput = forwardRef<InputRef, TimeTextInputProps>(
  (
    {
      value,
      onChange,
      onComplete,
      id,
      placeholder = 'HH:mm',
      disabled,
      size,
      status,
      style,
      ...rest
    },
    ref
  ) => {
    const [text, setTextState] = useState(() => formatValue(value));
    const isFocusedRef = useRef(false);
    // Latest text/value for handlers that fire synchronously mid-event: moving focus to the
    // next field blurs this one before React re-renders, so closures would be stale.
    const textRef = useRef(text);
    const valueRef = useRef(value);
    valueRef.current = value;

    const setText = (next: string) => {
      textRef.current = next;
      setTextState(next);
    };

    // Follow external value changes (e.g. a range computed from a duration) while not typing
    useEffect(() => {
      if (!isFocusedRef.current) setText(formatValue(value));
    }, [value]);

    const commit = (raw: string): boolean => {
      const value = valueRef.current;
      if (!raw.trim()) {
        setText('');
        if (value) onChange?.(null);
        return false;
      }

      const parsed = parseTimeText(raw);
      if (!parsed) {
        // Not a time — fall back to the last valid value
        setText(formatValue(value));
        return false;
      }

      const next = (value ?? dayjs())
        .hour(parsed.hour)
        .minute(parsed.minute)
        .second(0)
        .millisecond(0);
      setText(formatTime(parsed));
      if (!value || !next.isSame(value, 'minute')) {
        valueRef.current = next;
        onChange?.(next);
      }
      return true;
    };

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextText = event.target.value.replace(/[^\d:.,hH\s]/g, '').slice(0, MAX_LENGTH);
      setText(nextText);
      if (isCompleteTimeText(nextText) && commit(nextText)) {
        onComplete?.();
      }
    };

    const isInvalid = text.trim().length >= 4 && !parseTimeText(text);

    return (
      <Input
        {...rest}
        ref={ref}
        id={id}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        size={size}
        status={status || (isInvalid ? 'error' : undefined)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={MAX_LENGTH}
        style={style}
        onChange={handleChange}
        onFocus={event => {
          isFocusedRef.current = true;
          // Select everything so typing a new time replaces the old one
          event.target.select();
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          commit(textRef.current);
        }}
        onPressEnter={() => commit(textRef.current)}
      />
    );
  }
);

TimeTextInput.displayName = 'TimeTextInput';

// Helpers
const formatValue = (value?: Dayjs | null): string =>
  value && value.isValid() ? value.format('HH:mm') : '';

// Static content
const MAX_LENGTH = 5;
