import { describe, expect, it } from 'vitest';
import timeReportsOverviewReducer from './time-reports-overview.slice';

describe('timeReportsOverviewSlice initial state', () => {
  it('includes uncategorized projects by default so their time logs are reported', () => {
    const state = timeReportsOverviewReducer(undefined, { type: '@@INIT' });

    expect(state.noCategory).toBe(true);
  });
});
