/**
 * Speech utilities for Alexa responses
 * Includes SSML helpers and text formatting
 */
/**
 * Format a number as speech-friendly text
 */
export declare function speakNumber(num: number): string;
/**
 * Format sats amount for speech
 */
export declare function speakSats(amount: number): string;
/**
 * Add a pause in speech
 */
export declare function pause(seconds?: number): string;
/**
 * Emphasize text
 */
export declare function emphasize(text: string, level?: 'strong' | 'moderate' | 'reduced'): string;
/**
 * Say as a specific type (number, date, etc.)
 */
export declare function sayAs(text: string, interpretAs: 'number' | 'ordinal' | 'date' | 'time' | 'telephone'): string;
/**
 * Format a date for speech
 */
export declare function speakDate(dateString: string): string;
/**
 * Build a list for speech (e.g., "apples, oranges, and bananas")
 */
export declare function speakList(items: string[], conjunction?: 'and' | 'or'): string;
/**
 * Format a job for speech
 */
export declare function speakJob(job: {
    title: string;
    reward: number;
    createdAt?: string;
}, includeDate?: boolean): string;
/**
 * Create an ordinal (1st, 2nd, 3rd, etc.)
 */
export declare function ordinal(n: number): string;
/**
 * Wrap text in SSML speak tags
 */
export declare function ssml(text: string): string;
/**
 * Strip SSML tags for card display
 */
export declare function stripSSML(text: string): string;
//# sourceMappingURL=speech.d.ts.map