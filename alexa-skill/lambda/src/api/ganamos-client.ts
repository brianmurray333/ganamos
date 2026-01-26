/**
 * Ganamos API Client for Alexa Skill
 * Handles all communication with the Ganamos backend
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Configure base URL - uses environment variable or defaults to production
const API_BASE_URL = process.env.GANAMOS_API_URL || 'https://ganamos.earth/api/alexa';

export interface Job {
  id: string;
  title: string;
  description: string;
  reward: number;
  location: string;
  createdAt: string;
  createdBy: string;
  isOwnJob: boolean;
}

export interface GroupMember {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  isCurrentUser: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  groupCode: string;
  role: string;
}

export interface BalanceResponse {
  balance: number;
  name: string;
}

export interface CreateJobResponse {
  success: boolean;
  job?: {
    id: string;
    title: string;
    description: string;
    reward: number;
    createdAt: string;
  };
  newBalance?: number;
  error?: string;
  balance?: number;
  required?: number;
}

export interface CompleteJobResponse {
  success: boolean;
  message?: string;
  requiresVerification?: boolean;
  job?: {
    id: string;
    title: string;
    reward: number;
    ownerName?: string;
  };
  fixer?: {
    name: string;
    username?: string;
  };
  error?: string;
  suggestion?: string;
}

class GanamosClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Set the access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Check if the client has an access token
   */
  hasToken(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get list of jobs from the user's selected group
   */
  async getJobs(): Promise<{ jobs: Job[]; totalCount: number; groupName: string }> {
    try {
      const response = await this.client.get('/jobs');
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Create a new job
   */
  async createJob(description: string, reward: number): Promise<CreateJobResponse> {
    try {
      const response = await this.client.post('/jobs', {
        description,
        reward,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data as CreateJobResponse;
      }
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Mark a job as complete
   */
  async completeJob(jobId: string, fixerName: string): Promise<CompleteJobResponse> {
    try {
      const response = await this.client.post(`/jobs/${jobId}/complete`, {
        fixerName,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data as CompleteJobResponse;
      }
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get user's balance
   */
  async getBalance(): Promise<BalanceResponse> {
    try {
      const response = await this.client.get('/balance');
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get user's groups
   */
  async getGroups(): Promise<{ groups: Group[]; selectedGroupId: string | null }> {
    try {
      const response = await this.client.get('/groups');
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Update selected group
   */
  async updateSelectedGroup(groupId: string): Promise<{ message: string }> {
    try {
      const response = await this.client.put('/groups', { groupId });
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get group members
   */
  async getGroupMembers(): Promise<{ members: GroupMember[]; groupName: string }> {
    try {
      const response = await this.client.get('/group-members');
      return response.data;
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('Ganamos API Error:', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });
    } else {
      console.error('Unknown error:', error);
    }
  }
}

// Export singleton instance
export const ganamosClient = new GanamosClient();


