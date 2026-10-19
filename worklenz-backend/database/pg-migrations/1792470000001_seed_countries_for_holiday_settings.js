/* eslint-disable camelcase */

// The countries table had no seed data, so the Holiday Settings country picker was empty.
// Seed it with every country date-holidays supports (the ones official holidays can be
// synced for). Existing rows are kept; phone is unused by the app and required by the schema.

const Holidays = require('date-holidays');

const literal = value => `'${String(value).replace(/'/g, "''")}'`;

exports.up = pgm => {
  const countries = new Holidays().getCountries('en');
  const values = Object.entries(countries)
    .filter(([code]) => /^[A-Z]{2}$/.test(code))
    .map(([code, name]) => `(${literal(code)}, ${literal(name)})`);

  if (!values.length) return;

  pgm.sql(`
    INSERT INTO countries (code, name, phone)
    SELECT v.code, v.name, 0
    FROM (VALUES ${values.join(',\n')}) AS v(code, name)
    WHERE NOT EXISTS (SELECT 1 FROM countries c WHERE c.code = v.code);
  `);
};

// Seeded rows may be referenced by holiday settings afterwards, so they are kept.
exports.down = () => {};
