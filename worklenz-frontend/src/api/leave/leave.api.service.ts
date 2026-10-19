import apiClient from '@api/api-client';
import { API_BASE_URL } from '@/shared/constants';
import { IServerResponse } from '@/types/common.types';
import {
  IAttendanceReport,
  ICalendarHoliday,
  ICreateLeaveRequest,
  ILeaveAdjustment,
  ILeaveBalance,
  ILeaveRequest,
  IMyLeaveOverview,
  IMyWorkLocations,
  ITodayWorkLocation,
  LeaveRequestStatus,
  WorkLocation,
} from '@/types/leave/leave.types';

const rootUrl = `${API_BASE_URL}/leave`;

export const leaveApiService = {
  // Current member
  async getMyOverview(year: number): Promise<IServerResponse<IMyLeaveOverview>> {
    const response = await apiClient.get<IServerResponse<IMyLeaveOverview>>(`${rootUrl}/me`, {
      params: { year },
    });
    return response.data;
  },

  async createRequest(body: ICreateLeaveRequest): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.post<IServerResponse<{ id: string }>>(
      `${rootUrl}/requests`,
      body
    );
    return response.data;
  },

  async cancelRequest(id: string): Promise<IServerResponse<null>> {
    const response = await apiClient.post<IServerResponse<null>>(
      `${rootUrl}/requests/${id}/cancel`
    );
    return response.data;
  },

  /** Official and custom holidays in a date range, for calendars. */
  async getHolidays(start: string, end: string): Promise<IServerResponse<ICalendarHoliday[]>> {
    const response = await apiClient.get<IServerResponse<ICalendarHoliday[]>>(
      `${rootUrl}/holidays`,
      {
        params: { start, end },
      }
    );
    return response.data;
  },

  async getTodayLocation(date: string): Promise<IServerResponse<ITodayWorkLocation>> {
    const response = await apiClient.get<IServerResponse<ITodayWorkLocation>>(
      `${rootUrl}/work-locations/today`,
      { params: { date } }
    );
    return response.data;
  },

  async getMyLocations(year: number, month: number): Promise<IServerResponse<IMyWorkLocations>> {
    const response = await apiClient.get<IServerResponse<IMyWorkLocations>>(
      `${rootUrl}/work-locations`,
      { params: { year, month } }
    );
    return response.data;
  },

  async setLocation(
    date: string,
    location: WorkLocation | null,
    teamMemberId?: string
  ): Promise<IServerResponse<{ date: string; location: WorkLocation | null }>> {
    const response = await apiClient.put<
      IServerResponse<{ date: string; location: WorkLocation | null }>
    >(`${rootUrl}/work-locations`, { date, location, team_member_id: teamMemberId });
    return response.data;
  },

  // Leadership
  async getAttendance(year: number, month: number): Promise<IServerResponse<IAttendanceReport>> {
    const response = await apiClient.get<IServerResponse<IAttendanceReport>>(
      `${rootUrl}/attendance`,
      { params: { year, month } }
    );
    return response.data;
  },

  /** Romanian monthly attendance report (PDF) for the accountant. */
  async downloadAttendanceReport(year: number, month: number): Promise<Blob> {
    const response = await apiClient.get(`${rootUrl}/attendance/report.pdf`, {
      params: { year, month },
      responseType: 'blob',
    });
    return response.data as Blob;
  },

  async getBalances(year: number): Promise<IServerResponse<ILeaveBalance[]>> {
    const response = await apiClient.get<IServerResponse<ILeaveBalance[]>>(`${rootUrl}/balances`, {
      params: { year },
    });
    return response.data;
  },

  async setBaseAllowance(
    teamMemberId: string,
    year: number,
    baseDays: number
  ): Promise<IServerResponse<null>> {
    const response = await apiClient.put<IServerResponse<null>>(
      `${rootUrl}/balances/${teamMemberId}`,
      { year, base_days: baseDays }
    );
    return response.data;
  },

  async getAdjustments(
    teamMemberId: string,
    year: number
  ): Promise<IServerResponse<ILeaveAdjustment[]>> {
    const response = await apiClient.get<IServerResponse<ILeaveAdjustment[]>>(
      `${rootUrl}/balances/${teamMemberId}/adjustments`,
      { params: { year } }
    );
    return response.data;
  },

  async addAdjustment(
    teamMemberId: string,
    year: number,
    days: number,
    note: string
  ): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.post<IServerResponse<{ id: string }>>(
      `${rootUrl}/balances/${teamMemberId}/adjustments`,
      { year, days, note }
    );
    return response.data;
  },

  async updateAdjustment(
    teamMemberId: string,
    adjustmentId: string,
    days: number,
    note: string
  ): Promise<IServerResponse<{ id: string }>> {
    const response = await apiClient.put<IServerResponse<{ id: string }>>(
      `${rootUrl}/balances/${teamMemberId}/adjustments/${adjustmentId}`,
      { days, note }
    );
    return response.data;
  },

  async deleteAdjustment(
    teamMemberId: string,
    adjustmentId: string
  ): Promise<IServerResponse<null>> {
    const response = await apiClient.delete<IServerResponse<null>>(
      `${rootUrl}/balances/${teamMemberId}/adjustments/${adjustmentId}`
    );
    return response.data;
  },

  async deleteRequest(id: string): Promise<IServerResponse<null>> {
    const response = await apiClient.delete<IServerResponse<null>>(`${rootUrl}/requests/${id}`);
    return response.data;
  },

  async getRequests(status?: LeaveRequestStatus): Promise<IServerResponse<ILeaveRequest[]>> {
    const response = await apiClient.get<IServerResponse<ILeaveRequest[]>>(`${rootUrl}/requests`, {
      params: status ? { status } : {},
    });
    return response.data;
  },

  async reviewRequest(
    id: string,
    decision: 'approve' | 'reject',
    note?: string
  ): Promise<IServerResponse<null>> {
    const response = await apiClient.post<IServerResponse<null>>(
      `${rootUrl}/requests/${id}/review`,
      { decision, note }
    );
    return response.data;
  },
};
