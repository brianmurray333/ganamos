/**
 * Mock GitHub Store for Local Development
 * Provides realistic pull request data for testing daily summary and admin PR features
 * without requiring real GitHub API credentials
 */

interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  url: string;
}

interface GitHubLabel {
  name: string;
  color: string;
}

interface GitHubPullRequest {
  url: string;
  html_url: string;
}

export interface GitHubIssueItem {
  url: string;
  id: number;
  number: number;
  title: string;
  user: GitHubUser;
  body: string;
  state: "open" | "closed";
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  html_url: string;
  pull_request: GitHubPullRequest;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubIssueItem[];
}

/**
 * Singleton mock store for GitHub PRs
 * Persists across hot reloads using globalThis
 */
class MockGitHubStore {
  private static instance: MockGitHubStore;
  private prs: GitHubIssueItem[] = [];
  private repo: string = "brianmurray333/ganamos";

  private constructor() {
    this.initializeMockPRs();
  }

  static getInstance(): MockGitHubStore {
    if (!MockGitHubStore.instance) {
      // Use globalThis to persist across hot reloads
      if (typeof globalThis !== "undefined" && (globalThis as any).__mockGitHubStore) {
        MockGitHubStore.instance = (globalThis as any).__mockGitHubStore;
      } else {
        MockGitHubStore.instance = new MockGitHubStore();
        if (typeof globalThis !== "undefined") {
          (globalThis as any).__mockGitHubStore = MockGitHubStore.instance;
        }
      }
    }
    return MockGitHubStore.instance;
  }

  /**
   * Initialize store with 5-8 realistic merged PRs within last 24 hours
   */
  private initializeMockPRs(): void {
    const count = Math.floor(Math.random() * 4) + 5; // 5-8 PRs
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;

    const titles = [
      "feat: Add daily summary GitHub integration",
      "fix: Correct merge conflict handling in PR processor",
      "refactor: Extract mock store logic to separate module",
      "docs: Update GitHub API integration guide",
      "test: Add unit tests for MockGitHubStore",
      "perf: Optimize GitHub API response parsing",
      "ci: Update CI pipeline for mock API testing",
      "chore: Clean up deprecated GitHub API endpoints",
    ];

    const authors: GitHubUser[] = [
      {
        login: "github-bot",
        id: 100001,
        avatar_url: "https://avatars.githubusercontent.com/u/100001",
        url: "https://api.github.com/users/github-bot",
      },
      {
        login: "alice-dev",
        id: 100002,
        avatar_url: "https://avatars.githubusercontent.com/u/100002",
        url: "https://api.github.com/users/alice-dev",
      },
      {
        login: "bob-engineer",
        id: 100003,
        avatar_url: "https://avatars.githubusercontent.com/u/100003",
        url: "https://api.github.com/users/bob-engineer",
      },
      {
        login: "charlie-contractor",
        id: 100004,
        avatar_url: "https://avatars.githubusercontent.com/u/100004",
        url: "https://api.github.com/users/charlie-contractor",
      },
      {
        login: "diana-maintainer",
        id: 100005,
        avatar_url: "https://avatars.githubusercontent.com/u/100005",
        url: "https://api.github.com/users/diana-maintainer",
      },
    ];

    const labelPool: GitHubLabel[] = [
      { name: "enhancement", color: "a2eeef" },
      { name: "bug-fix", color: "d73a49" },
      { name: "documentation", color: "0075ca" },
      { name: "testing", color: "fbca04" },
      { name: "refactoring", color: "e2e2f2" },
    ];

    this.prs = [];

    for (let i = 0; i < count; i++) {
      const prNumber = 1000 + i;
      const mergedAt = new Date(now - Math.random() * oneDayMs);
      const createdAt = new Date(mergedAt.getTime() - Math.random() * sevenDaysMs);
      const author = authors[Math.floor(Math.random() * authors.length)];
      const title = titles[i % titles.length];

      // Select 1-3 random labels
      const labelCount = Math.floor(Math.random() * 3) + 1;
      const labels: GitHubLabel[] = [];
      for (let j = 0; j < labelCount; j++) {
        const label = labelPool[Math.floor(Math.random() * labelPool.length)];
        if (!labels.find((l) => l.name === label.name)) {
          labels.push(label);
        }
      }

      const pr: GitHubIssueItem = {
        url: `https://api.github.com/repos/${this.repo}/issues/${prNumber}`,
        id: prNumber,
        number: prNumber,
        title,
        user: author,
        body: `This PR ${title.toLowerCase()}.\n\nImplemented changes include:\n- Core functionality\n- Tests and documentation\n- Review feedback addressed`,
        state: "closed",
        labels,
        created_at: createdAt.toISOString(),
        updated_at: mergedAt.toISOString(),
        closed_at: mergedAt.toISOString(),
        merged_at: mergedAt.toISOString(),
        html_url: `https://github.com/${this.repo}/pull/${prNumber}`,
        pull_request: {
          url: `https://api.github.com/repos/${this.repo}/pulls/${prNumber}`,
          html_url: `https://github.com/${this.repo}/pull/${prNumber}`,
        },
      };

      this.prs.push(pr);
    }

    console.log(
      `[Mock GitHub Store] Initialized with ${this.prs.length} realistic PRs within last 24 hours`
    );
  }

  /**
   * Search PRs by query (basic implementation)
   * For MVP: returns all merged PRs sorted by updated_at descending
   */
  searchPRs(query: string): GitHubSearchResponse {
    // Basic filtering: merged PRs within last 24 hours
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const filteredPRs = this.prs
      .filter((pr) => {
        if (!pr.merged_at) return false;
        const mergedTime = new Date(pr.merged_at).getTime();
        return now - mergedTime <= oneDayMs;
      })
      .sort((a, b) => {
        const aTime = new Date(a.updated_at).getTime();
        const bTime = new Date(b.updated_at).getTime();
        return bTime - aTime; // descending
      });

    console.log(
      `[Mock GitHub Store] Search query: "${query}" - Found ${filteredPRs.length} results`
    );

    return {
      total_count: filteredPRs.length,
      incomplete_results: false,
      items: filteredPRs,
    };
  }

  /**
   * Add a custom PR to the store
   */
  addPR(pr: GitHubIssueItem): void {
    this.prs.push(pr);
    console.log(`[Mock GitHub Store] Added PR #${pr.number}: ${pr.title}`);
  }

  /**
   * Reset store to initial state with fresh auto-generated data
   */
  resetStore(): void {
    this.prs = [];
    this.initializeMockPRs();
    console.log("[Mock GitHub Store] Store reset to initial state");
  }

  /**
   * Get all PRs (for debugging)
   */
  getAllPRs(): GitHubIssueItem[] {
    return [...this.prs];
  }

  /**
   * Get store statistics
   */
  getStats() {
    return {
      totalPRs: this.prs.length,
      mergedPRs: this.prs.filter((pr) => pr.merged_at).length,
      openPRs: this.prs.filter((pr) => pr.state === "open").length,
      closedPRs: this.prs.filter((pr) => pr.state === "closed").length,
    };
  }
}

// Export singleton instance getter
export const mockGitHubStore = {
  getInstance: () => MockGitHubStore.getInstance(),
};
