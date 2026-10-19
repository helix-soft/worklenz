import { IAbsencePeriod } from "./leave-calculations";

/**
 * Monthly attendance report for the accountant. The document is always in Romanian
 * (it is sent to a Romanian accountant), independent of the user's UI language.
 */

export interface IAttendanceReportMember {
  name: string;
  worked_days: number;
  vacation: IAbsencePeriod[];
  sick: IAbsencePeriod[];
}

export interface IAttendanceReportData {
  organizationName: string;
  /** Logo as a data URI, embedded so rendering never depends on network access. */
  logoDataUri?: string | null;
  year: number;
  month: number;
  workDays: number;
  generatedAt: Date;
  members: IAttendanceReportMember[];
}

const MONTHS_RO = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** "2026-11-02" -> "02.11.2026" */
const formatDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const formatPeriod = (period: IAbsencePeriod) =>
  period.start === period.end ? formatDate(period.start) : `${formatDate(period.start)} – ${formatDate(period.end)}`;

const dayLabel = (count: number) => (count === 1 ? "1 zi" : `${count} zile`);

const absenceSection = (
  title: string,
  emptyText: string,
  members: IAttendanceReportMember[],
  pick: (member: IAttendanceReportMember) => IAbsencePeriod[]
) => {
  const rows = members
    .map(member => ({ name: member.name, periods: pick(member) }))
    .filter(row => row.periods.length > 0);

  const body = rows.length
    ? `<table>
        <thead><tr><th class="nr">Nr.</th><th>Nume</th><th class="num">Zile</th><th>Perioade</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row, index) => `<tr>
                <td class="nr">${index + 1}</td>
                <td>${escapeHtml(row.name)}</td>
                <td class="num">${row.periods.reduce((sum, p) => sum + p.days, 0)}</td>
                <td>${row.periods.map(p => `${formatPeriod(p)} (${dayLabel(p.days)})`).join("<br>")}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>`
    : `<p class="empty">${emptyText}</p>`;

  return `<section><h2>${title}</h2>${body}</section>`;
};

export const buildAttendanceReportHtml = (data: IAttendanceReportData): string => {
  const monthLabel = `${MONTHS_RO[data.month - 1]} ${data.year}`;
  const generated = formatDate(data.generatedAt.toISOString().slice(0, 10));

  const workedRows = data.members
    .map(
      (member, index) => `<tr>
        <td class="nr">${index + 1}</td>
        <td>${escapeHtml(member.name)}</td>
        <td class="num">${member.worked_days}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>Raport lunar de prezență – ${monthLabel}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f1f1f; font-size: 11pt; margin: 0; }
  header { border-bottom: 2px solid #1f1f1f; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .logo { max-height: 48px; max-width: 200px; object-fit: contain; }
  .org { font-size: 10pt; color: #595959; text-transform: uppercase; letter-spacing: 0.04em; }
  h1 { font-size: 18pt; margin: 4px 0 6px; }
  .meta { font-size: 10pt; color: #595959; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  h2 { font-size: 13pt; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #bfbfbf; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  td.num, th.num { text-align: right; width: 110px; white-space: nowrap; }
  td.nr, th.nr { width: 40px; text-align: right; }
  .empty { margin: 0; padding: 8px 10px; border: 1px dashed #bfbfbf; color: #595959; font-style: italic; }
  .note { font-size: 9pt; color: #595959; margin-top: 6px; }
</style>
</head>
<body>
  <header>
    <div>
      <div class="org">${escapeHtml(data.organizationName)}</div>
      <h1>Raport lunar de prezență – ${monthLabel}</h1>
      <div class="meta">Zile lucrătoare în lună: <strong>${data.workDays}</strong> · Generat la: ${generated}</div>
    </div>
    ${data.logoDataUri ? `<img class="logo" src="${escapeHtml(data.logoDataUri)}" alt="Logo">` : ""}
  </header>

  <section>
    <h2>1. Zile lucrate</h2>
    ${
      data.members.length
        ? `<table>
            <thead><tr><th class="nr">Nr.</th><th>Nume</th><th class="num">Zile lucrate</th></tr></thead>
            <tbody>${workedRows}</tbody>
          </table>
          <p class="note">Zile lucrate = zile lucrătoare oficiale (fără weekenduri și sărbători legale) minus zilele de concediu de odihnă și concediu medical.</p>`
        : `<p class="empty">Nu există angajați pentru această lună.</p>`
    }
  </section>

  ${absenceSection(
    "2. Concediu de odihnă",
    "Nu a fost nimeni în concediu de odihnă în această lună.",
    data.members,
    member => member.vacation
  )}

  ${absenceSection(
    "3. Concediu medical",
    "Nu a fost nimeni în concediu medical în această lună.",
    data.members,
    member => member.sick
  )}
</body>
</html>`;
};

export const ATTENDANCE_REPORT_FOOTER = `
<div style="width: 100%; font-size: 8pt; color: #8c8c8c; padding: 0 15mm; display: flex; justify-content: flex-end; font-family: Arial, sans-serif;">
  Pagina <span class="pageNumber"></span> din <span class="totalPages"></span>
</div>`;

export const attendanceReportFileName = (year: number, month: number) =>
  `raport-prezenta-${year}-${String(month).padStart(2, "0")}.pdf`;
