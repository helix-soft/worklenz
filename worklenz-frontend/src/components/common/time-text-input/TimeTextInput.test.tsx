import React, { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dayjs } from 'dayjs';
import { InputRef } from '@/shared/antd-imports';
import { TimeTextInput } from './TimeTextInput';

const TimeRange = () => {
  const [start, setStart] = useState<Dayjs | null>(null);
  const [end, setEnd] = useState<Dayjs | null>(null);
  const endRef = useRef<InputRef>(null);

  return (
    <>
      <TimeTextInput
        aria-label="Start"
        value={start}
        onChange={setStart}
        onComplete={() => endRef.current?.focus()}
      />
      <TimeTextInput ref={endRef} aria-label="End" value={end} onChange={setEnd} />
      <output data-testid="range">
        {start?.format('HH:mm') ?? '-'}/{end?.format('HH:mm') ?? '-'}
      </output>
    </>
  );
};

describe('TimeTextInput', () => {
  it('turns 1131 into 11:31 and moves focus to the end field', async () => {
    const user = userEvent.setup();
    render(<TimeRange />);

    await user.click(screen.getByLabelText('Start'));
    await user.keyboard('1131');

    expect(screen.getByLabelText('Start')).toHaveValue('11:31');
    expect(screen.getByLabelText('End')).toHaveFocus();

    await user.keyboard('1245');
    expect(screen.getByLabelText('End')).toHaveValue('12:45');
    expect(screen.getByTestId('range')).toHaveTextContent('11:31/12:45');
  });

  it('handles a start and end time typed in one continuous burst', async () => {
    const user = userEvent.setup();
    render(<TimeRange />);

    await user.click(screen.getByLabelText('Start'));
    await user.keyboard('11111245');
    await user.tab();

    expect(screen.getByTestId('range')).toHaveTextContent('11:11/12:45');
  });

  it('normalizes short input on blur', async () => {
    const user = userEvent.setup();
    render(<TimeRange />);

    await user.click(screen.getByLabelText('Start'));
    await user.keyboard('931');
    await user.tab();

    expect(screen.getByLabelText('Start')).toHaveValue('09:31');
    expect(screen.getByTestId('range')).toHaveTextContent('09:31/-');
  });

  it('reverts invalid input to the last valid time', async () => {
    const user = userEvent.setup();
    render(<TimeRange />);

    await user.click(screen.getByLabelText('Start'));
    await user.keyboard('0800');
    await user.click(screen.getByLabelText('Start'));
    await user.keyboard('2599');
    await user.tab();

    expect(screen.getByLabelText('Start')).toHaveValue('08:00');
    expect(screen.getByTestId('range')).toHaveTextContent('08:00/-');
  });
});
