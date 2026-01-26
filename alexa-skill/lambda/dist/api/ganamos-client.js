"use strict";
/**
 * Ganamos API Client for Alexa Skill
 * Handles all communication with the Ganamos backend
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ganamosClient = void 0;
const axios_1 = __importDefault(require("axios"));
// Configure base URL - uses environment variable or defaults to production
const API_BASE_URL = process.env.GANAMOS_API_URL || 'https://ganamos.earth/api/alexa';
class GanamosClient {
    constructor() {
        this.accessToken = null;
        this.client = axios_1.default.create({
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
    setAccessToken(token) {
        this.accessToken = token;
        this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    /**
     * Check if the client has an access token
     */
    hasToken() {
        return !!this.accessToken;
    }
    /**
     * Get list of jobs from the user's selected group
     */
    async getJobs() {
        try {
            const response = await this.client.get('/jobs');
            return response.data;
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Create a new job
     */
    async createJob(description, reward) {
        try {
            const response = await this.client.post('/jobs', {
                description,
                reward,
            });
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response) {
                return error.response.data;
            }
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Mark a job as complete
     */
    async completeJob(jobId, fixerName) {
        try {
            const response = await this.client.post(`/jobs/${jobId}/complete`, {
                fixerName,
            });
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response) {
                return error.response.data;
            }
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Get user's balance
     */
    async getBalance() {
        try {
            const response = await this.client.get('/balance');
            return response.data;
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Get user's groups
     */
    async getGroups() {
        try {
            const response = await this.client.get('/groups');
            return response.data;
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Update selected group
     */
    async updateSelectedGroup(groupId) {
        try {
            const response = await this.client.put('/groups', { groupId });
            return response.data;
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Get group members
     */
    async getGroupMembers() {
        try {
            const response = await this.client.get('/group-members');
            return response.data;
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
    /**
     * Handle API errors
     */
    handleError(error) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            console.error('Ganamos API Error:', {
                status: axiosError.response?.status,
                data: axiosError.response?.data,
                message: axiosError.message,
            });
        }
        else {
            console.error('Unknown error:', error);
        }
    }
}
// Export singleton instance
exports.ganamosClient = new GanamosClient();
//# sourceMappingURL=ganamos-client.js.map