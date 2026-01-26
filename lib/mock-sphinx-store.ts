/**
 * Mock Sphinx Chat Store
 * 
 * In-memory store for simulating Sphinx Chat API during development/testing.
 * Tracks broadcasted messages without making real API calls.
 * 
 * Usage:
 * - Automatically used when USE_MOCKS=true
 * - Messages are stored in memory (reset on server restart)
 * - Access via /api/mock/sphinx/messages for debugging
 */

export interface MockSphinxMessage {
  messageId: string
  chatId: string
  chatPubkey: string
  botId: string
  content: string
  timestamp: Date
  action: 'broadcast' | 'message'
}

class MockSphinxStore {
  private messages: Map<string, MockSphinxMessage> = new Map()
  private messageIdCounter = 1

  /**
   * Broadcast a message to the tribe (mimics Sphinx API)
   * @param chatPubkey - Tribe's public key
   * @param botId - Bot identifier
   * @param content - Message content
   * @returns Mock message object
   */
  broadcastMessage(
    chatPubkey: string,
    botId: string,
    content: string
  ): MockSphinxMessage {
    const messageId = `sphinx-msg-${this.messageIdCounter++}`
    const chatId = `sphinx-chat-${chatPubkey.substring(0, 8)}`

    const message: MockSphinxMessage = {
      messageId,
      chatId,
      chatPubkey,
      botId,
      content,
      timestamp: new Date(),
      action: 'broadcast',
    }

    this.messages.set(messageId, message)

    console.log('[MOCK SPHINX] Broadcasted message:', messageId)
    console.log('[MOCK SPHINX] Chat:', chatPubkey.substring(0, 12) + '...')
    console.log('[MOCK SPHINX] Content length:', content.length)

    return message
  }

  /**
   * Get all messages (for debugging)
   * @returns Array of all stored messages
   */
  getAllMessages(): MockSphinxMessage[] {
    return Array.from(this.messages.values())
  }

  /**
   * Get message by ID
   * @param messageId - Message identifier
   * @returns Message if found, undefined otherwise
   */
  getMessage(messageId: string): MockSphinxMessage | undefined {
    return this.messages.get(messageId)
  }

  /**
   * Get messages by chat pubkey
   * @param chatPubkey - Tribe's public key
   * @returns Array of messages for the specified chat
   */
  getMessagesByChat(chatPubkey: string): MockSphinxMessage[] {
    return Array.from(this.messages.values()).filter(
      (msg) => msg.chatPubkey === chatPubkey
    )
  }

  /**
   * Get total message count
   * @returns Number of messages in store
   */
  getMessageCount(): number {
    return this.messages.size
  }

  /**
   * Reset store (for testing)
   * Clears all messages and resets counter
   */
  reset(): void {
    this.messages.clear()
    this.messageIdCounter = 1
    console.log('[MOCK SPHINX] Store reset - all messages cleared')
  }
}

// Export singleton instance
export const mockSphinxStore = new MockSphinxStore()