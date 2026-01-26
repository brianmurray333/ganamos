/**
 * GROQ SDK Wrapper
 * 
 * Provides a unified interface for GROQ API calls that automatically
 * routes to mock endpoints when USE_MOCKS=true.
 */

import { serverEnv } from './env';

interface GroqMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

interface GroqCompletionOptions {
  messages: GroqMessage[];
  model: string;
  temperature?: number;
  max_completion_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

interface GroqCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Create GROQ chat completion
 * Routes to mock when USE_MOCKS=true
 */
export async function createChatCompletion(
  options: GroqCompletionOptions
): Promise<GroqCompletionResponse> {
  
  if (serverEnv?.groq.useMock) {
    return createMockCompletion(options);
  }

  // Use real GROQ SDK
  const { Groq } = await import('groq-sdk');
  const groq = new Groq({
    apiKey: serverEnv?.groq.apiKey,
  });

  return groq.chat.completions.create(options as any);
}

/**
 * Create mock completion by calling our mock API
 */
async function createMockCompletion(
  options: GroqCompletionOptions
): Promise<GroqCompletionResponse> {
  
  // Extract images and text from messages
  const userMessage = options.messages.find(m => m.role === 'user');
  if (!userMessage) {
    throw new Error('No user message found');
  }

  const textContent = userMessage.content.find(c => c.type === 'text')?.text || '';
  const images = userMessage.content.filter(c => c.type === 'image_url');

  const beforeImage = images[0]?.image_url?.url;
  const afterImage = images[1]?.image_url?.url;

  // Extract title and description from prompt
  const titleMatch = textContent.match(/ISSUE TITLE:\s*(.+)/);
  const descriptionMatch = textContent.match(/ISSUE DESCRIPTION:\s*(.+)/);

  const title = titleMatch?.[1]?.trim() || 'Untitled';
  const description = descriptionMatch?.[1]?.trim() || '';

  // Call mock API
  const response = await fetch(
    `http://localhost:${process.env.PORT || '3457'}/api/mock/groq/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beforeImage,
        afterImage,
        description,
        title,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Mock GROQ API failed: ${response.statusText}`);
  }

  const data = await response.json();

  // Format response to match real GROQ SDK structure
  const mockResponse = `CONFIDENCE: ${data.confidence}\nREASONING: ${data.reasoning}`;

  return {
    choices: [
      {
        message: {
          content: mockResponse,
        },
      },
    ],
  };
}