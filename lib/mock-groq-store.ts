/**
 * Mock GROQ Store
 * 
 * In-memory store for simulating GROQ AI API during development/testing.
 * Provides deterministic responses for image verification without calling the real API.
 * 
 * Usage:
 * - Automatically used when USE_MOCKS=true
 * - Analyzes image data URLs to provide realistic responses
 * - Access via /api/mock/groq/verifications for debugging
 */

export interface MockGroqVerification {
  verificationId: string;
  beforeImage: string;
  afterImage: string;
  description: string;
  title: string;
  confidence: number;
  reasoning: string;
  timestamp: Date;
}

class MockGroqStore {
  private verifications: Map<string, MockGroqVerification> = new Map();
  private verificationIdCounter = 1;

  /**
   * Verify a fix submission (mimics GROQ vision API)
   * Uses heuristics to generate realistic responses
   * 
   * @param beforeImage - Base64 data URL of before image
   * @param afterImage - Base64 data URL of after image  
   * @param description - Issue description
   * @param title - Issue title
   * @returns Mock verification result
   */
  verifyFix(
    beforeImage: string,
    afterImage: string,
    description: string,
    title: string
  ): { confidence: number; reasoning: string } {
    const verificationId = `groq-verify-${this.verificationIdCounter++}`;

    // Analyze the inputs to generate a realistic response
    const result = this.analyzeFixSubmission(
      beforeImage,
      afterImage,
      description,
      title
    );

    // Store the verification for debugging
    const verification: MockGroqVerification = {
      verificationId,
      beforeImage: this.truncateDataUrl(beforeImage),
      afterImage: this.truncateDataUrl(afterImage),
      description,
      title,
      confidence: result.confidence,
      reasoning: result.reasoning,
      timestamp: new Date(),
    };

    this.verifications.set(verificationId, verification);

    console.log('[MOCK GROQ] Verified fix submission:', verificationId);
    console.log('[MOCK GROQ] Title:', title);
    console.log('[MOCK GROQ] Confidence:', result.confidence);

    return result;
  }

  /**
   * Analyze fix submission to generate realistic confidence score
   * Uses heuristics based on image size and description keywords
   */
  private analyzeFixSubmission(
    beforeImage: string,
    afterImage: string,
    description: string,
    title: string
  ): { confidence: number; reasoning: string } {
    // Default to high confidence for mock (happy path)
    let confidence = 8;
    let reasoning = '';

    // Check if images are different sizes (likely different images)
    const beforeSize = beforeImage.length;
    const afterSize = afterImage.length;
    const sizeDiff = Math.abs(beforeSize - afterSize);
    const sizeDiffPercent = (sizeDiff / Math.max(beforeSize, afterSize)) * 100;

    // If images are identical or very similar in size, lower confidence
    if (sizeDiffPercent < 5) {
      confidence = 6;
      reasoning = 'The before and after images appear very similar in content. While some work may have been done, the change is not clearly visible. Consider providing images with more distinct differences.';
    } else if (sizeDiffPercent < 15) {
      confidence = 7;
      reasoning = 'The images show some differences, suggesting work was performed. The fix appears to address the reported issue, though the improvement could be more pronounced.';
    } else {
      confidence = 8;
      reasoning = 'The before and after images show clear differences. The reported issue appears to have been addressed effectively. The fix demonstrates visible improvement to the community space.';
    }

    // Boost confidence for common fix keywords in description
    const fixKeywords = ['clean', 'repair', 'fix', 'remove', 'paint', 'restore', 'replace'];
    const lowerDescription = description.toLowerCase();
    const hasFixKeywords = fixKeywords.some(keyword => lowerDescription.includes(keyword));

    if (hasFixKeywords && confidence >= 7) {
      confidence = 9;
      reasoning = 'The before and after images show substantial improvement. The description aligns well with the visual changes, indicating the issue was properly addressed. This fix makes a clear positive impact.';
    }

    // Never return confidence below 5 in mock mode (happy path)
    if (confidence < 5) {
      confidence = 6;
    }

    return { confidence, reasoning };
  }

  /**
   * Truncate data URL for storage (keep first 100 chars)
   */
  private truncateDataUrl(dataUrl: string): string {
    if (dataUrl.length <= 100) return dataUrl;
    return dataUrl.substring(0, 100) + '...[truncated]';
  }

  /**
   * Get all verifications (for debugging)
   */
  getAllVerifications(): MockGroqVerification[] {
    return Array.from(this.verifications.values());
  }

  /**
   * Get verification by ID
   */
  getVerification(verificationId: string): MockGroqVerification | undefined {
    return this.verifications.get(verificationId);
  }

  /**
   * Clear all verifications (for testing)
   */
  reset(): void {
    this.verifications.clear();
    this.verificationIdCounter = 1;
    console.log('[MOCK GROQ] Store reset');
  }
}

// Singleton instance
const mockGroqStore = new MockGroqStore();

export { mockGroqStore };
