import apiClient from '@api/api-client';
import { API_BASE_URL } from '@/shared/constants';
import { IServerResponse } from '@/types/common.types';
import { IGoogleCalendarEvent, IGoogleCalendarStatus } from '@/types/google-calendar.types';

const rootUrl = `${API_BASE_URL}/google-calendar`;

/** Read-only Google Calendar integration of the current user. */
export const googleCalendarApiService = {
  async getStatus(): Promise<IServerResponse<IGoogleCalendarStatus>> {
    const response = await apiClient.get<IServerResponse<IGoogleCalendarStatus>>(
      `${rootUrl}/status`
    );
    return response.data;
  },

  async getAuthUrl(): Promise<IServerResponse<{ url: string }>> {
    const response = await apiClient.get<IServerResponse<{ url: string }>>(`${rootUrl}/auth-url`);
    return response.data;
  },

  async sync(): Promise<IServerResponse<IGoogleCalendarStatus>> {
    const response = await apiClient.post<IServerResponse<IGoogleCalendarStatus>>(
      `${rootUrl}/sync`
    );
    return response.data;
  },

  async disconnect(): Promise<IServerResponse<null>> {
    const response = await apiClient.delete<IServerResponse<null>>(`${rootUrl}/connection`);
    return response.data;
  },

  async getEvents(start: string, end: string): Promise<IServerResponse<IGoogleCalendarEvent[]>> {
    const response = await apiClient.get<IServerResponse<IGoogleCalendarEvent[]>>(
      `${rootUrl}/events`,
      {
        params: { start, end },
      }
    );
    return response.data;
  },
};
