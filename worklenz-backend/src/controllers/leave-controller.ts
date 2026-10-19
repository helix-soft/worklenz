import { promises as fs } from "fs";
import path from "path";
import puppeteer from "puppeteer";

import db from "../config/db";
import HandleExceptions from "../decorators/handle-exceptions";
import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import { hasTeamAdminPrivileges } from "../shared/team-permissions";
import { isValidUuid } from "../shared/validation-helpers";
import {
  ATTENDANCE_REPORT_FOOTER,
  attendanceReportFileName,
  buildAttendanceReportHtml,
} from "../shared/attendance-report-pdf";
import {
  buildAbsencePeriods,
  computeMonthlyAttendance,
  countDeductedLeaveDays,
  countWorkDays,
  createWorkDayChecker,
  expandTimeOff,
  DEFAULT_WORKING_DAYS,
  IHolidayDate,
  ITimeOffRange,
  IWorkingDays,
  IWorkLocationDay,
  isIsoDate,
  isLeaveDeducting,
  listDates,
  monthRange,
  yearRange,
} from "../shared/leave-calculations";

const LEAVE_TYPES = new Set(["vacation", "sick"]);
const WORK_LOCATIONS = new Set(["office", "remote"]);
const MAX_NOTE_LENGTH = 500;

interface ITeamMemberRow {
  team_member_id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

interface IOrgCalendar {
  organizationId: string;
  workingDays: IWorkingDays;
  holidays: IHolidayDate[];
}

const parseYear = (value: unknown): number | null => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
};

const parseMonth = (value: unknown): number | null => {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
};

const roundDays = (value: number) => Math.round(value * 10) / 10;

/** Leave is only taken in whole days. */
const isWholeDays = (value: number, min: number) => Number.isInteger(value) && value >= min && value <= 366;

export default class LeaveController extends WorklenzControllerBase {
  private static async getOrganizationId(req: IWorkLenzRequest): Promise<string | null> {
    const result = await db.query(`SELECT id FROM organizations WHERE user_id = $1 LIMIT 1`, [
      req.user?.owner_id || req.user?.id,
    ]);
    return result.rows[0]?.id || null;
  }

  private static async getOrgCalendar(req: IWorkLenzRequest, start: string, end: string): Promise<IOrgCalendar | null> {
    const organizationId = await LeaveController.getOrganizationId(req);
    if (!organizationId) return null;

    // Custom organization holidays, plus the official holidays of the country chosen in
    // Holiday Settings when "Automatically sync official holidays" is on.
    const holidaysResult = await db.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, is_recurring
       FROM organization_holidays
       WHERE organization_id = $1 AND (is_recurring = TRUE OR date BETWEEN $2::DATE AND $3::DATE)
       UNION ALL
       SELECT to_char(ch.date, 'YYYY-MM-DD') AS date, ch.is_recurring
       FROM organization_holiday_settings ohs
       JOIN country_holidays ch ON ch.country_code = ohs.country_code
       WHERE ohs.organization_id = $1 AND ohs.auto_sync_holidays = TRUE
         AND (ch.is_recurring = TRUE OR ch.date BETWEEN $2::DATE AND $3::DATE)`,
      [organizationId, start, end]
    );

    // Official work days for leave & attendance are always Monday–Friday minus official holidays,
    // independent of the organization's capacity working-days setting.
    return {
      organizationId,
      workingDays: DEFAULT_WORKING_DAYS,
      holidays: holidaysResult.rows,
    };
  }

  private static async getTeamMembers(teamId: string, teamMemberId?: string): Promise<ITeamMemberRow[]> {
    const params: unknown[] = [teamId];
    let memberFilter = "";
    if (teamMemberId !== undefined && !isValidUuid(teamMemberId)) return [];
    if (teamMemberId) {
      params.push(teamMemberId);
      memberFilter = "AND tm.id = $2";
    }

    const result = await db.query(
      `SELECT tm.id AS team_member_id, u.id AS user_id, u.name, u.email, u.avatar_url
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.active = TRUE AND tm.is_guest = FALSE ${memberFilter}
       ORDER BY u.name`,
      params
    );
    return result.rows;
  }

  private static async getTimeOffByMember(memberIds: string[], start: string, end: string): Promise<Map<string, ITimeOffRange[]>> {
    const byMember = new Map<string, ITimeOffRange[]>();
    if (!memberIds.length) return byMember;

    const result = await db.query(
      `SELECT team_member_id,
              to_char(start_date::DATE, 'YYYY-MM-DD') AS start_date,
              to_char(end_date::DATE, 'YYYY-MM-DD') AS end_date,
              type, is_full_day
       FROM member_time_off
       WHERE team_member_id = ANY($1::UUID[])
         AND start_date::DATE <= $3::DATE AND end_date::DATE >= $2::DATE`,
      [memberIds, start, end]
    );

    for (const row of result.rows) {
      const list = byMember.get(row.team_member_id) || [];
      list.push(row);
      byMember.set(row.team_member_id, list);
    }
    return byMember;
  }

  private static async getBalanceRows(teamId: string, year: number, calendar: IOrgCalendar, teamMemberId?: string) {
    const members = await LeaveController.getTeamMembers(teamId, teamMemberId);
    const memberIds = members.map(m => m.team_member_id);
    const { start, end } = yearRange(year);
    const isWorkDay = createWorkDayChecker(calendar.workingDays, calendar.holidays);

    const [allowances, adjustments, pending, timeOff] = await Promise.all([
      db.query(
        `SELECT a.team_member_id, a.base_days, a.updated_at, u.name AS updated_by_name
         FROM member_leave_allowances a
         LEFT JOIN users u ON u.id = a.updated_by
         WHERE a.team_member_id = ANY($1::UUID[]) AND a.year = $2`,
        [memberIds, year]
      ),
      db.query(
        `SELECT team_member_id, SUM(days) AS extra_days
         FROM member_leave_adjustments
         WHERE team_member_id = ANY($1::UUID[]) AND year = $2
         GROUP BY team_member_id`,
        [memberIds, year]
      ),
      db.query(
        `SELECT team_member_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                to_char(end_date, 'YYYY-MM-DD') AS end_date, type
         FROM member_leave_requests
         WHERE team_member_id = ANY($1::UUID[]) AND status = 'pending'
           AND start_date <= $3::DATE AND end_date >= $2::DATE`,
        [memberIds, start, end]
      ),
      LeaveController.getTimeOffByMember(memberIds, start, end),
    ]);

    const allowanceByMember = new Map(allowances.rows.map(r => [r.team_member_id, r]));
    const extraByMember = new Map(adjustments.rows.map(r => [r.team_member_id, Number(r.extra_days)]));

    return members.map(member => {
      const allowance = allowanceByMember.get(member.team_member_id);
      const baseDays = allowance ? Number(allowance.base_days) : null;
      const extraDays = extraByMember.get(member.team_member_id) || 0;
      const usedDays = countDeductedLeaveDays(timeOff.get(member.team_member_id) || [], start, end, isWorkDay);
      const pendingDays = pending.rows
        .filter(r => r.team_member_id === member.team_member_id && isLeaveDeducting(r.type))
        .reduce((sum, r) => {
          const from = r.start_date > start ? r.start_date : start;
          const to = r.end_date < end ? r.end_date : end;
          return sum + countWorkDays(from, to, isWorkDay);
        }, 0);
      const totalDays = (baseDays ?? 0) + extraDays;

      return {
        ...member,
        year,
        base_days: baseDays,
        extra_days: roundDays(extraDays),
        total_days: roundDays(totalDays),
        used_days: usedDays,
        pending_days: pendingDays,
        remaining_days: roundDays(totalDays - usedDays),
        base_updated_at: allowance?.updated_at ?? null,
        base_updated_by_name: allowance?.updated_by_name ?? null,
      };
    });
  }

  private static async getAttendanceRows(req: IWorkLenzRequest, year: number, month: number) {
    const { start, end } = monthRange(year, month);
    const calendar = await LeaveController.getOrgCalendar(req, start, end);
    if (!calendar) return null;

    const members = await LeaveController.getTeamMembers(req.user?.team_id as string);
    const memberIds = members.map(m => m.team_member_id);
    const isWorkDay = createWorkDayChecker(calendar.workingDays, calendar.holidays);

    const [timeOff, locations, hours, org] = await Promise.all([
      LeaveController.getTimeOffByMember(memberIds, start, end),
      db.query(
        `SELECT team_member_id, to_char(work_date, 'YYYY-MM-DD') AS work_date, location
         FROM member_work_locations
         WHERE team_member_id = ANY($1::UUID[]) AND work_date BETWEEN $2::DATE AND $3::DATE`,
        [memberIds, start, end]
      ),
      db.query(
        `SELECT twl.user_id, SUM(twl.time_spent) AS seconds
         FROM task_work_log twl
         JOIN tasks t ON t.id = twl.task_id
         JOIN projects p ON p.id = t.project_id
         JOIN users u ON u.id = twl.user_id
         LEFT JOIN timezones tz ON tz.id = u.timezone_id
         WHERE p.team_id = $1
           AND (twl.created_at AT TIME ZONE COALESCE(tz.name, 'UTC'))::DATE BETWEEN $2::DATE AND $3::DATE
         GROUP BY twl.user_id`,
        [req.user?.team_id, start, end]
      ),
      db.query(`SELECT hours_per_day FROM organizations WHERE id = $1`, [calendar.organizationId]),
    ]);
    const hoursPerDay = Number(org.rows[0]?.hours_per_day) || 8;

    const locationsByMember = new Map<string, IWorkLocationDay[]>();
    for (const row of locations.rows) {
      const list = locationsByMember.get(row.team_member_id) || [];
      list.push(row);
      locationsByMember.set(row.team_member_id, list);
    }
    const secondsByUser = new Map(hours.rows.map(r => [r.user_id, Number(r.seconds)]));

    return {
      year,
      month,
      start_date: start,
      end_date: end,
      work_days: countWorkDays(start, end, isWorkDay),
      members: members.map(member => {
        const memberTimeOff = timeOff.get(member.team_member_id) || [];
        const periodParams = { rangeStart: start, rangeEnd: end, isWorkDay, timeOff: memberTimeOff };
        const attendance = computeMonthlyAttendance({
          rangeStart: start,
          rangeEnd: end,
          isWorkDay,
          timeOff: memberTimeOff,
          locations: locationsByMember.get(member.team_member_id) || [],
        });
        return {
          ...member,
          logged_hours: Math.round(((secondsByUser.get(member.user_id) || 0) / 3600) * 100) / 100,
          // Hours the member should have logged: worked days × the organization's hours per day.
          expected_hours: Math.round(attendance.worked_days * hoursPerDay * 100) / 100,
          ...attendance,
          vacation_periods: buildAbsencePeriods({ ...periodParams, type: "vacation" }),
          sick_periods: buildAbsencePeriods({ ...periodParams, type: "sick" }),
        };
      }),
    };
  }

  /* ---------------------------- Leadership: attendance ---------------------------- */

  @HandleExceptions()
  public static async getAttendance(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const year = parseYear(req.query.year);
    const month = parseMonth(req.query.month);
    if (!year || !month) return res.status(400).send(new ServerResponse(false, null, "Valid year and month are required"));

    const data = await LeaveController.getAttendanceRows(req, year, month);
    if (!data) return res.status(404).send(new ServerResponse(false, null, "Organization not found"));
    return res.status(200).send(new ServerResponse(true, data));
  }

  /**
   * The organization's logo (Admin Center → Overview) as a data URI, falling back to the
   * Worklenz logo when none is uploaded or it cannot be fetched.
   */
  private static async getReportLogo(logoUrl?: string | null): Promise<string | null> {
    if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
      try {
        const response = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
        const contentType = response.headers.get("content-type") || "";
        if (response.ok && contentType.startsWith("image/")) {
          const buffer = Buffer.from(await response.arrayBuffer());
          if (buffer.length <= 2 * 1024 * 1024) return `data:${contentType};base64,${buffer.toString("base64")}`;
        }
      } catch {
        // Fall through to the default logo.
      }
    }

    try {
      const fallback = await fs.readFile(path.join(__dirname, "..", "public", "assets", "images", "logo.png"));
      return `data:image/png;base64,${fallback.toString("base64")}`;
    } catch {
      return null;
    }
  }

  /** Monthly attendance report for the accountant, as a Romanian PDF. */
  @HandleExceptions()
  public static async exportAttendancePdf(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const year = parseYear(req.query.year);
    const month = parseMonth(req.query.month);
    if (!year || !month) return res.status(400).send(new ServerResponse(false, null, "Valid year and month are required"));

    const data = await LeaveController.getAttendanceRows(req, year, month);
    if (!data) return res.status(404).send(new ServerResponse(false, null, "Organization not found"));

    const orgResult = await db.query(`SELECT organization_name, logo_url FROM organizations WHERE user_id = $1 LIMIT 1`, [
      req.user?.owner_id || req.user?.id,
    ]);

    const html = buildAttendanceReportHtml({
      organizationName: orgResult.rows[0]?.organization_name || "",
      logoDataUri: await LeaveController.getReportLogo(orgResult.rows[0]?.logo_url),
      year,
      month,
      workDays: data.work_days,
      generatedAt: new Date(),
      members: data.members.map(member => ({
        name: member.name,
        worked_days: member.worked_days,
        vacation: member.vacation_periods,
        sick: member.sick_periods,
      })),
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: ATTENDANCE_REPORT_FOOTER,
        margin: { top: "15mm", right: "15mm", bottom: "18mm", left: "15mm" },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${attendanceReportFileName(year, month)}"`);
      res.setHeader("Content-Length", pdf.length);
      res.end(Buffer.from(pdf));
      return res;
    } finally {
      await browser.close();
    }
  }

  /* ---------------------------- Leadership: balances ---------------------------- */

  @HandleExceptions()
  public static async getBalances(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).send(new ServerResponse(false, null, "Valid year is required"));

    const { start, end } = yearRange(year);
    const calendar = await LeaveController.getOrgCalendar(req, start, end);
    if (!calendar) return res.status(404).send(new ServerResponse(false, null, "Organization not found"));

    const rows = await LeaveController.getBalanceRows(req.user?.team_id as string, year, calendar);
    return res.status(200).send(new ServerResponse(true, rows));
  }

  @HandleExceptions()
  public static async setBaseAllowance(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { teamMemberId } = req.params;
    const year = parseYear(req.body?.year);
    const baseDays = Number(req.body?.base_days);
    if (!year) return res.status(400).send(new ServerResponse(false, null, "Valid year is required"));
    if (!isWholeDays(baseDays, 0)) {
      return res.status(400).send(new ServerResponse(false, null, "base_days must be a whole number between 0 and 366"));
    }

    const organizationId = await LeaveController.getOrganizationId(req);
    const [member] = await LeaveController.getTeamMembers(req.user?.team_id as string, teamMemberId);
    if (!organizationId || !member) return res.status(404).send(new ServerResponse(false, null, "Team member not found"));

    await db.query(
      `INSERT INTO member_leave_allowances (organization_id, team_member_id, year, base_days, updated_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (team_member_id, year)
       DO UPDATE SET base_days = EXCLUDED.base_days, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [organizationId, teamMemberId, year, baseDays, req.user?.id]
    );
    return res.status(200).send(new ServerResponse(true, null));
  }

  @HandleExceptions()
  public static async getAdjustments(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { teamMemberId } = req.params;
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).send(new ServerResponse(false, null, "Valid year is required"));

    const [member] = await LeaveController.getTeamMembers(req.user?.team_id as string, teamMemberId);
    if (!member) return res.status(404).send(new ServerResponse(false, null, "Team member not found"));

    const result = await db.query(
      `${LeaveController.ADJUSTMENT_SELECT}
       WHERE a.team_member_id = $1 AND a.year = $2
       ORDER BY a.created_at DESC`,
      [teamMemberId, year]
    );
    return res.status(200).send(new ServerResponse(true, result.rows.map(r => ({ ...r, days: Number(r.days) }))));
  }

  @HandleExceptions()
  public static async addAdjustment(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { teamMemberId } = req.params;
    const year = parseYear(req.body?.year);
    const days = Number(req.body?.days);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

    if (!year) return res.status(400).send(new ServerResponse(false, null, "Valid year is required"));
    if (!isWholeDays(days, 1)) {
      return res.status(400).send(new ServerResponse(false, null, "days must be a positive whole number"));
    }
    if (!note || note.length > MAX_NOTE_LENGTH) {
      return res.status(400).send(new ServerResponse(false, null, "A note is required (max 500 characters)"));
    }

    const organizationId = await LeaveController.getOrganizationId(req);
    const [member] = await LeaveController.getTeamMembers(req.user?.team_id as string, teamMemberId);
    if (!organizationId || !member) return res.status(404).send(new ServerResponse(false, null, "Team member not found"));

    const result = await db.query(
      `INSERT INTO member_leave_adjustments (organization_id, team_member_id, year, days, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [organizationId, teamMemberId, year, days, note, req.user?.id]
    );
    return res.status(201).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async updateAdjustment(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { teamMemberId, adjustmentId } = req.params;
    const days = Number(req.body?.days);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";

    if (!isValidUuid(adjustmentId)) return res.status(404).send(new ServerResponse(false, null, "Adjustment not found"));
    if (!isWholeDays(days, 1)) {
      return res.status(400).send(new ServerResponse(false, null, "days must be a positive whole number"));
    }
    if (!note || note.length > MAX_NOTE_LENGTH) {
      return res.status(400).send(new ServerResponse(false, null, "A note is required (max 500 characters)"));
    }

    const [member] = await LeaveController.getTeamMembers(req.user?.team_id as string, teamMemberId);
    if (!member) return res.status(404).send(new ServerResponse(false, null, "Team member not found"));

    const result = await db.query(
      `UPDATE member_leave_adjustments
       SET days = $3, note = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_member_id = $2
       RETURNING id`,
      [adjustmentId, teamMemberId, days, note, req.user?.id]
    );
    if (!result.rows.length) return res.status(404).send(new ServerResponse(false, null, "Adjustment not found"));
    return res.status(200).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async deleteAdjustment(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { teamMemberId, adjustmentId } = req.params;
    if (!isValidUuid(adjustmentId)) return res.status(404).send(new ServerResponse(false, null, "Adjustment not found"));

    const [member] = await LeaveController.getTeamMembers(req.user?.team_id as string, teamMemberId);
    if (!member) return res.status(404).send(new ServerResponse(false, null, "Team member not found"));

    const result = await db.query(
      `DELETE FROM member_leave_adjustments WHERE id = $1 AND team_member_id = $2 RETURNING id`,
      [adjustmentId, teamMemberId]
    );
    if (!result.rows.length) return res.status(404).send(new ServerResponse(false, null, "Adjustment not found"));
    return res.status(200).send(new ServerResponse(true, null));
  }

  /* ---------------------------- Leave requests ---------------------------- */

  @HandleExceptions()
  public static async getRequests(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const params: unknown[] = [req.user?.team_id];
    let statusFilter = "";
    if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) {
      params.push(status);
      statusFilter = "AND r.status = $2";
    }

    const result = await db.query(
      `${LeaveController.REQUEST_SELECT}
       WHERE tm.team_id = $1 ${statusFilter}
       ORDER BY (r.status = 'pending') DESC, r.start_date DESC
       LIMIT 200`,
      params
    );
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  @HandleExceptions()
  public static async reviewRequest(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { id } = req.params;
    const decision = req.body?.decision;
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (decision !== "approve" && decision !== "reject") {
      return res.status(400).send(new ServerResponse(false, null, "decision must be approve or reject"));
    }
    if (note.length > MAX_NOTE_LENGTH) {
      return res.status(400).send(new ServerResponse(false, null, "Note is too long"));
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const requestResult = await client.query(
        `SELECT r.*, to_char(r.start_date, 'YYYY-MM-DD') AS start_iso, to_char(r.end_date, 'YYYY-MM-DD') AS end_iso
         FROM member_leave_requests r
         JOIN team_members tm ON tm.id = r.team_member_id
         WHERE r.id = $1 AND tm.team_id = $2
         FOR UPDATE OF r`,
        [id, req.user?.team_id]
      );
      const request = requestResult.rows[0];
      if (!request) {
        await client.query("ROLLBACK");
        return res.status(404).send(new ServerResponse(false, null, "Leave request not found"));
      }
      const targetStatus = decision === "approve" ? "approved" : "rejected";
      if (request.status === "cancelled" || request.status === targetStatus) {
        await client.query("ROLLBACK");
        return res.status(409).send(new ServerResponse(false, null, "This request cannot be changed to that status"));
      }

      // Changing an approved request back to rejected removes the time off it created.
      if (request.status === "approved" && request.time_off_id) {
        await client.query(`DELETE FROM member_time_off WHERE id = $1`, [request.time_off_id]);
      }

      let timeOffId: string | null = null;
      if (decision === "approve") {
        const overlap = await client.query(
          `SELECT 1 FROM member_time_off
           WHERE team_member_id = $1 AND start_date::DATE <= $3::DATE AND end_date::DATE >= $2::DATE
           LIMIT 1`,
          [request.team_member_id, request.start_iso, request.end_iso]
        );
        if (overlap.rows.length) {
          await client.query("ROLLBACK");
          return res.status(409).send(new ServerResponse(false, null, "The member already has time off in this period"));
        }

        const inserted = await client.query(
          `INSERT INTO member_time_off (team_member_id, organization_id, start_date, end_date, reason, created_by, is_full_day, type)
           VALUES ($1, $2, $3::DATE, $4::DATE, $5, $6, TRUE, $7)
           RETURNING id`,
          [
            request.team_member_id,
            request.organization_id,
            request.start_iso,
            request.end_iso,
            request.reason,
            req.user?.id,
            request.type,
          ]
        );
        timeOffId = inserted.rows[0].id;
      }

      await client.query(
        `UPDATE member_leave_requests
         SET status = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP, review_note = $4,
             time_off_id = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id, targetStatus, req.user?.id, note || null, timeOffId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return res.status(200).send(new ServerResponse(true, null));
  }

  /** Permanently deletes a request; an approved one also removes its time off, returning the days. */
  @HandleExceptions()
  public static async deleteRequest(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `DELETE FROM member_leave_requests r
         USING team_members tm
         WHERE r.id = $1 AND tm.id = r.team_member_id AND tm.team_id = $2
         RETURNING r.time_off_id`,
        [req.params.id, req.user?.team_id]
      );
      if (!result.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).send(new ServerResponse(false, null, "Leave request not found"));
      }
      const timeOffId = result.rows[0].time_off_id;
      if (timeOffId) await client.query(`DELETE FROM member_time_off WHERE id = $1`, [timeOffId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return res.status(200).send(new ServerResponse(true, null));
  }

  /* ---------------------------- Current member ---------------------------- */

  @HandleExceptions()
  public static async getMyOverview(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).send(new ServerResponse(false, null, "Valid year is required"));
    if (!req.user?.team_member_id) return res.status(400).send(new ServerResponse(false, null, "Missing team member context"));

    const { start, end } = yearRange(year);
    const calendar = await LeaveController.getOrgCalendar(req, start, end);
    if (!calendar) return res.status(404).send(new ServerResponse(false, null, "Organization not found"));

    const [balance] = await LeaveController.getBalanceRows(
      req.user.team_id as string,
      year,
      calendar,
      req.user.team_member_id
    );
    const [requests, adjustments] = await Promise.all([
      db.query(
        `${LeaveController.REQUEST_SELECT}
         WHERE r.team_member_id = $1 AND r.start_date <= $3::DATE AND r.end_date >= $2::DATE
         ORDER BY r.start_date DESC`,
        [req.user.team_member_id, start, end]
      ),
      db.query(
        `${LeaveController.ADJUSTMENT_SELECT}
         WHERE a.team_member_id = $1 AND a.year = $2
         ORDER BY a.created_at DESC`,
        [req.user.team_member_id, year]
      ),
    ]);

    return res.status(200).send(
      new ServerResponse(true, {
        balance: balance || null,
        requests: requests.rows,
        adjustments: adjustments.rows.map(r => ({ ...r, days: Number(r.days) })),
      })
    );
  }

  @HandleExceptions()
  public static async createRequest(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { start_date, end_date, type } = req.body || {};
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!isIsoDate(start_date) || !isIsoDate(end_date) || end_date < start_date) {
      return res.status(400).send(new ServerResponse(false, null, "Valid start_date and end_date are required"));
    }
    if (start_date.slice(0, 4) !== end_date.slice(0, 4)) {
      return res.status(400).send(new ServerResponse(false, null, "A leave request cannot span two years"));
    }
    if (!LEAVE_TYPES.has(type)) return res.status(400).send(new ServerResponse(false, null, "Invalid leave type"));
    if (reason.length > MAX_NOTE_LENGTH) return res.status(400).send(new ServerResponse(false, null, "Reason is too long"));
    if (!req.user?.team_member_id) return res.status(400).send(new ServerResponse(false, null, "Missing team member context"));

    const year = Number(start_date.slice(0, 4));
    const { start, end } = yearRange(year);
    const calendar = await LeaveController.getOrgCalendar(req, start, end);
    if (!calendar) return res.status(404).send(new ServerResponse(false, null, "Organization not found"));

    const isWorkDay = createWorkDayChecker(calendar.workingDays, calendar.holidays);
    const requestedDays = countWorkDays(start_date, end_date, isWorkDay);
    if (requestedDays === 0) {
      return res.status(400).send(new ServerResponse(false, null, "The selected period has no work days"));
    }

    const overlap = await db.query(
      `SELECT 1 FROM member_leave_requests
       WHERE team_member_id = $1 AND status IN ('pending', 'approved')
         AND start_date <= $3::DATE AND end_date >= $2::DATE
       UNION ALL
       SELECT 1 FROM member_time_off
       WHERE team_member_id = $1 AND start_date::DATE <= $3::DATE AND end_date::DATE >= $2::DATE
       LIMIT 1`,
      [req.user.team_member_id, start_date, end_date]
    );
    if (overlap.rows.length) {
      return res.status(409).send(new ServerResponse(false, null, "You already have leave in this period"));
    }

    if (isLeaveDeducting(type)) {
      const [balance] = await LeaveController.getBalanceRows(req.user.team_id as string, year, calendar, req.user.team_member_id);
      const available = balance ? balance.remaining_days - balance.pending_days : 0;
      if (requestedDays > available) {
        return res.status(400).send(new ServerResponse(false, null, "Not enough leave days remaining"));
      }
    }

    const result = await db.query(
      `INSERT INTO member_leave_requests (organization_id, team_member_id, start_date, end_date, type, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [calendar.organizationId, req.user.team_member_id, start_date, end_date, type, reason || null, req.user.id]
    );
    return res.status(201).send(new ServerResponse(true, result.rows[0]));
  }

  @HandleExceptions()
  public static async cancelRequest(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const result = await db.query(
      `UPDATE member_leave_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND team_member_id = $2 AND status = 'pending'
       RETURNING id`,
      [req.params.id, req.user?.team_member_id]
    );
    if (!result.rows.length) return res.status(404).send(new ServerResponse(false, null, "Pending leave request not found"));
    return res.status(200).send(new ServerResponse(true, null));
  }

  /**
   * Official and custom holidays in a date range (max. ~1 year), for calendars. Uses the same
   * sources as the leave calculations: organization holidays, plus the country's official
   * holidays when auto-sync is on. Recurring holidays are expanded to concrete dates.
   */
  @HandleExceptions()
  public static async getHolidays(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { start, end } = req.query;
    if (!isIsoDate(start) || !isIsoDate(end) || end < start) {
      return res.status(400).send(new ServerResponse(false, null, "Valid start and end dates are required"));
    }
    const days = listDates(start, end);
    if (days.length > 400) return res.status(400).send(new ServerResponse(false, null, "Date range is too long"));

    const organizationId = await LeaveController.getOrganizationId(req);
    if (!organizationId) return res.status(200).send(new ServerResponse(true, []));

    const result = await db.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, is_recurring, name, 'custom' AS source
       FROM organization_holidays
       WHERE organization_id = $1 AND (is_recurring = TRUE OR date BETWEEN $2::DATE AND $3::DATE)
       UNION ALL
       SELECT to_char(ch.date, 'YYYY-MM-DD') AS date, ch.is_recurring, ch.name, 'official' AS source
       FROM organization_holiday_settings ohs
       JOIN country_holidays ch ON ch.country_code = ohs.country_code
       WHERE ohs.organization_id = $1 AND ohs.auto_sync_holidays = TRUE
         AND (ch.is_recurring = TRUE OR ch.date BETWEEN $2::DATE AND $3::DATE)`,
      [organizationId, start, end]
    );

    const holidays: { date: string; name: string; source: string }[] = [];
    const seen = new Set<string>();
    for (const row of result.rows) {
      const dates = row.is_recurring ? days.filter(d => d.slice(5) === row.date.slice(5)) : [row.date];
      for (const date of dates) {
        const key = `${date}|${row.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        holidays.push({ date, name: row.name, source: row.source });
      }
    }
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    return res.status(200).send(new ServerResponse(true, holidays));
  }

  /* ---------------------------- Work location check-in ---------------------------- */

  /** Today's check-in status; the client sends its local date so the day matches the user's timezone. */
  @HandleExceptions()
  public static async getTodayLocation(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const date = req.query.date;
    if (!isIsoDate(date)) return res.status(400).send(new ServerResponse(false, null, "Valid date is required"));
    if (!req.user?.team_member_id || req.user.is_guest) {
      return res.status(200).send(new ServerResponse(true, { date, should_ask: false }));
    }

    const calendar = await LeaveController.getOrgCalendar(req, date, date);
    if (!calendar) return res.status(200).send(new ServerResponse(true, { date, should_ask: false }));

    const isWorkDay = createWorkDayChecker(calendar.workingDays, calendar.holidays)(date);
    const [location, timeOff] = await Promise.all([
      db.query(`SELECT location FROM member_work_locations WHERE team_member_id = $1 AND work_date = $2`, [
        req.user.team_member_id,
        date,
      ]),
      db.query(
        `SELECT 1 FROM member_time_off
         WHERE team_member_id = $1 AND is_full_day = TRUE AND start_date::DATE <= $2::DATE AND end_date::DATE >= $2::DATE
         LIMIT 1`,
        [req.user.team_member_id, date]
      ),
    ]);

    const currentLocation = location.rows[0]?.location || null;
    const isOnLeave = timeOff.rows.length > 0;
    return res.status(200).send(
      new ServerResponse(true, {
        date,
        location: currentLocation,
        is_work_day: isWorkDay,
        is_on_leave: isOnLeave,
        should_ask: isWorkDay && !isOnLeave && !currentLocation,
      })
    );
  }

  @HandleExceptions()
  public static async getMyLocations(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const year = parseYear(req.query.year);
    const month = parseMonth(req.query.month);
    if (!year || !month) return res.status(400).send(new ServerResponse(false, null, "Valid year and month are required"));
    if (!req.user?.team_member_id) return res.status(400).send(new ServerResponse(false, null, "Missing team member context"));

    const { start, end } = monthRange(year, month);
    const calendar = await LeaveController.getOrgCalendar(req, start, end);
    if (!calendar) return res.status(404).send(new ServerResponse(false, null, "Organization not found"));

    const [locations, timeOff] = await Promise.all([
      db.query(
        `SELECT to_char(work_date, 'YYYY-MM-DD') AS work_date, location
         FROM member_work_locations
         WHERE team_member_id = $1 AND work_date BETWEEN $2::DATE AND $3::DATE`,
        [req.user.team_member_id, start, end]
      ),
      LeaveController.getTimeOffByMember([req.user.team_member_id], start, end),
    ]);

    const isWorkDay = createWorkDayChecker(calendar.workingDays, calendar.holidays);
    const memberTimeOff = timeOff.get(req.user.team_member_id) || [];
    return res.status(200).send(
      new ServerResponse(true, {
        locations: locations.rows,
        summary: computeMonthlyAttendance({
          rangeStart: start,
          rangeEnd: end,
          isWorkDay,
          timeOff: memberTimeOff,
          locations: locations.rows,
        }),
        // Days fully covered by approved leave; no check-in is needed for them.
        leave_dates: [...expandTimeOff(memberTimeOff, start, end).keys()],
        ...LeaveController.splitDates(start, end, isWorkDay),
      })
    );
  }

  private static splitDates(start: string, end: string, isWorkDay: (date: string) => boolean) {
    const work_day_dates: string[] = [];
    const non_work_dates: string[] = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
      const iso = cursor.toISOString().slice(0, 10);
      (isWorkDay(iso) ? work_day_dates : non_work_dates).push(iso);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { work_day_dates, non_work_dates };
  }

  /** Sets (or clears with location=null) the check-in of a day. Members edit their own days; leadership any member's. */
  @HandleExceptions()
  public static async setLocation(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { date, location } = req.body || {};
    const requestedMemberId: string | undefined = req.body?.team_member_id;
    if (!isIsoDate(date)) return res.status(400).send(new ServerResponse(false, null, "Valid date is required"));
    if (location !== null && !WORK_LOCATIONS.has(location)) {
      return res.status(400).send(new ServerResponse(false, null, "Invalid location"));
    }

    // Allow one day of slack for clients ahead of the server's timezone.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    if (date > tomorrow) return res.status(400).send(new ServerResponse(false, null, "Future days cannot be marked"));

    const isLeadership = hasTeamAdminPrivileges(req.user);
    const teamMemberId = requestedMemberId && isLeadership ? requestedMemberId : req.user?.team_member_id;
    if (!teamMemberId) return res.status(400).send(new ServerResponse(false, null, "Missing team member context"));

    const organizationId = await LeaveController.getOrganizationId(req);
    const [member] = await LeaveController.getTeamMembers(req.user?.team_id as string, teamMemberId);
    if (!organizationId || !member) return res.status(404).send(new ServerResponse(false, null, "Team member not found"));

    if (location === null) {
      await db.query(`DELETE FROM member_work_locations WHERE team_member_id = $1 AND work_date = $2`, [teamMemberId, date]);
    } else {
      await db.query(
        `INSERT INTO member_work_locations (organization_id, team_member_id, work_date, location, set_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (team_member_id, work_date)
         DO UPDATE SET location = EXCLUDED.location, set_by = EXCLUDED.set_by, updated_at = CURRENT_TIMESTAMP`,
        [organizationId, teamMemberId, date, location, req.user?.id]
      );
    }
    return res.status(200).send(new ServerResponse(true, { date, location }));
  }

  private static readonly ADJUSTMENT_SELECT = `
    SELECT a.id, a.year, a.days::INT AS days, a.note, a.created_at, a.updated_at,
           cu.name AS created_by_name, uu.name AS updated_by_name
    FROM member_leave_adjustments a
    LEFT JOIN users cu ON cu.id = a.created_by
    LEFT JOIN users uu ON uu.id = a.updated_by`;

  private static readonly REQUEST_SELECT = `
    SELECT r.id, r.team_member_id, to_char(r.start_date, 'YYYY-MM-DD') AS start_date,
           to_char(r.end_date, 'YYYY-MM-DD') AS end_date, r.type, r.reason, r.status,
           r.review_note, r.reviewed_at, r.created_at,
           u.name AS member_name, u.email AS member_email, u.avatar_url AS member_avatar,
           rv.name AS reviewed_by_name
    FROM member_leave_requests r
    JOIN team_members tm ON tm.id = r.team_member_id
    JOIN users u ON u.id = tm.user_id
    LEFT JOIN users rv ON rv.id = r.reviewed_by`;
}
