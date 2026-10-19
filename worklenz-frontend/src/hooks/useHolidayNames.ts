import { useEffect, useState } from 'react';
import { Dayjs } from 'dayjs';
import { leaveApiService } from '@/api/leave/leave.api.service';
import logger from '@/utils/errorLogger';

const MAX_YEARS = 5;

/**
 * Official (country) and company holidays between two dates, as a map of
 * "YYYY-MM-DD" → holiday name(s). The endpoint serves at most ~1 year per call,
 * so longer ranges are fetched in yearly chunks (capped at five years).
 */
export const useHolidayNames = (start: Dayjs | null, end: Dayjs | null, isEnabled = true) => {
  const [holidayNames, setHolidayNames] = useState<Map<string, string>>(new Map());
  const startKey = start?.format('YYYY-MM-DD');
  const endKey = end?.format('YYYY-MM-DD');

  useEffect(() => {
    if (!isEnabled || !start || !end || end.isBefore(start)) {
      setHolidayNames(new Map());
      return;
    }

    const chunks: [string, string][] = [];
    for (let cur = start; !cur.isAfter(end) && chunks.length < MAX_YEARS; cur = cur.add(1, 'year')) {
      const chunkEnd = cur.add(1, 'year').subtract(1, 'day');
      chunks.push([cur.format('YYYY-MM-DD'), (chunkEnd.isBefore(end) ? chunkEnd : end).format('YYYY-MM-DD')]);
    }

    let isCancelled = false;
    Promise.all(chunks.map(([from, to]) => leaveApiService.getHolidays(from, to)))
      .then(responses => {
        if (isCancelled) return;
        const map = new Map<string, string>();
        responses.forEach(res =>
          (res.done ? res.body : []).forEach(h =>
            map.set(h.date, map.has(h.date) ? `${map.get(h.date)}, ${h.name}` : h.name)
          )
        );
        setHolidayNames(map);
      })
      .catch(error => logger.error('Error fetching holidays', error));

    return () => {
      isCancelled = true;
    };
    // start/end are compared by their date keys so new Dayjs instances don't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, endKey, isEnabled]);

  return holidayNames;
};
