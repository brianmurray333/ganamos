/**
 * Ganamos API Client for Alexa Skill
 * Handles all communication with the Ganamos backend
 */
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
declare class GanamosClient {
    private client;
    private accessToken;
    constructor();
    /**
     * Set the access token for authenticated requests
     */
    setAccessToken(token: string): void;
    /**
     * Check if the client has an access token
     */
    hasToken(): boolean;
    /**
     * Get list of jobs from the user's selected group
     */
    getJobs(): Promise<{
        jobs: Job[];
        totalCount: number;
        groupName: string;
    }>;
    /**
     * Create a new job
     */
    createJob(description: string, reward: number): Promise<CreateJobResponse>;
    /**
     * Mark a job as complete
     */
    completeJob(jobId: string, fixerName: string): Promise<CompleteJobResponse>;
    /**
     * Get user's balance
     */
    getBalance(): Promise<BalanceResponse>;
    /**
     * Get user's groups
     */
    getGroups(): Promise<{
        groups: Group[];
        selectedGroupId: string | null;
    }>;
    /**
     * Update selected group
     */
    updateSelectedGroup(groupId: string): Promise<{
        message: string;
    }>;
    /**
     * Get group members
     */
    getGroupMembers(): Promise<{
        members: GroupMember[];
        groupName: string;
    }>;
    /**
     * Handle API errors
     */
    private handleError;
}
export declare const ganamosClient: GanamosClient;
export {};
//# sourceMappingURL=ganamos-client.d.ts.map