/**
 * Mock Twilio Store
 * 
 * In-memory store for simulating Twilio SMS messages during testing.
 * Provides methods to send, retrieve, filter, and reset messages.
 * 
 * Pattern follows lib/mock-email-store.ts for consistency.
 */

export interface MockTwilioMessage {
  sid: string;
  account_sid: string;
  to: string;
  from: string;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  date_created: string;
  date_updated: string;
  date_sent: string | null;
  direction: 'outbound-api';
  num_segments: string;
  price: string | null;
  price_unit: string;
  error_code: string | null;
  error_message: string | null;
  uri: string;
}

interface MockTwilioStoreState {
  messages: MockTwilioMessage[];
}

class MockTwilioStore {
  private state: MockTwilioStoreState = {
    messages: []
  };

  /**
   * Send a mock SMS message
   */
  sendMessage(params: {
    accountSid: string;
    to: string;
    from: string;
    body: string;
  }): MockTwilioMessage {
    const now = new Date().toISOString();
    const messageSid = `SM${this.generateRandomId()}`;
    
    const message: MockTwilioMessage = {
      sid: messageSid,
      account_sid: params.accountSid,
      to: params.to,
      from: params.from,
      body: params.body,
      status: 'sent',
      date_created: now,
      date_updated: now,
      date_sent: now,
      direction: 'outbound-api',
      num_segments: '1',
      price: null,
      price_unit: 'USD',
      error_code: null,
      error_message: null,
      uri: `/2010-04-01/Accounts/${params.accountSid}/Messages/${messageSid}.json`
    };

    this.state.messages.push(message);
    
    console.log('[Mock Twilio] SMS sent:', {
      to: params.to,
      from: params.from,
      body: params.body.substring(0, 50) + (params.body.length > 50 ? '...' : ''),
      sid: messageSid
    });

    return message;
  }

  /**
   * Get all messages
   */
  getAllMessages(): MockTwilioMessage[] {
    return [...this.state.messages];
  }

  /**
   * Get messages filtered by phone number (to or from)
   */
  getMessagesByPhone(phoneNumber: string): MockTwilioMessage[] {
    return this.state.messages.filter(
      msg => msg.to === phoneNumber || msg.from === phoneNumber
    );
  }

  /**
   * Get a specific message by SID
   */
  getMessageBySid(sid: string): MockTwilioMessage | undefined {
    return this.state.messages.find(msg => msg.sid === sid);
  }

  /**
   * Reset all messages (clear the store)
   */
  reset(): void {
    console.log('[Mock Twilio] Store reset - clearing all messages');
    this.state.messages = [];
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.state.messages.length;
  }

  /**
   * Generate a random ID for message SIDs
   */
  private generateRandomId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Singleton instance
export const mockTwilioStore = new MockTwilioStore();
