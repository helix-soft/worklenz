/* eslint-disable camelcase */

// calculate_member_capacity (used by the Planner's Schedule and Workload views) only knew
// organization_holidays, so official country holidays (Holiday Settings → country + auto-sync)
// never showed up as holidays there. Extend its holiday check with country_holidays, using the
// same rule as the leave calculations. The live definition is patched in place so earlier
// changes to the function are preserved.

const ORIGINAL_END = `            ) AS is_holiday
        FROM day_flags df`;

const PATCHED_END = `            ) OR EXISTS (
                SELECT 1
                FROM organization_holiday_settings ohs
                JOIN country_holidays ch ON ch.country_code = ohs.country_code
                WHERE ohs.organization_id = df.organization_id
                  AND ohs.auto_sync_holidays = TRUE
                  AND (
                    ch.date = df.date
                    OR (
                      ch.is_recurring = TRUE
                      AND EXTRACT(MONTH FROM ch.date) = EXTRACT(MONTH FROM df.date)
                      AND EXTRACT(DAY FROM ch.date) = EXTRACT(DAY FROM df.date)
                    )
                  )
            ) AS is_holiday
        FROM day_flags df`;

const getDefinition = async pgm => {
  const result = await pgm.db.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'calculate_member_capacity'
  `);
  if (result.rows.length !== 1) {
    throw new Error(`Expected one calculate_member_capacity function, found ${result.rows.length}`);
  }
  return result.rows[0].def;
};

exports.up = async pgm => {
  const def = await getDefinition(pgm);
  if (def.includes('country_holidays')) return;
  if (!def.includes(ORIGINAL_END)) {
    throw new Error('calculate_member_capacity holiday check not found; patch it manually');
  }
  pgm.sql(def.replace(ORIGINAL_END, PATCHED_END));
};

exports.down = async pgm => {
  const def = await getDefinition(pgm);
  if (!def.includes(PATCHED_END)) return;
  pgm.sql(def.replace(PATCHED_END, ORIGINAL_END));
};
