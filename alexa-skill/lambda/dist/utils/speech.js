"use strict";
/**
 * Speech utilities for Alexa responses
 * Includes SSML helpers and text formatting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.speakNumber = speakNumber;
exports.speakSats = speakSats;
exports.pause = pause;
exports.emphasize = emphasize;
exports.sayAs = sayAs;
exports.speakDate = speakDate;
exports.speakList = speakList;
exports.speakJob = speakJob;
exports.ordinal = ordinal;
exports.ssml = ssml;
exports.stripSSML = stripSSML;
/**
 * Format a number as speech-friendly text
 */
function speakNumber(num) {
    return num.toLocaleString('en-US');
}
/**
 * Format sats amount for speech
 */
function speakSats(amount) {
    if (amount === 1) {
        return '1 sat';
    }
    return `${speakNumber(amount)} sats`;
}
/**
 * Add a pause in speech
 */
function pause(seconds = 0.5) {
    return `<break time="${seconds}s"/>`;
}
/**
 * Emphasize text
 */
function emphasize(text, level = 'moderate') {
    return `<emphasis level="${level}">${text}</emphasis>`;
}
/**
 * Say as a specific type (number, date, etc.)
 */
function sayAs(text, interpretAs) {
    return `<say-as interpret-as="${interpretAs}">${text}</say-as>`;
}
/**
 * Format a date for speech
 */
function speakDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffHours < 1) {
        return 'just now';
    }
    else if (diffHours < 24) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    }
    else if (diffDays === 1) {
        return 'yesterday';
    }
    else if (diffDays < 7) {
        return `${diffDays} days ago`;
    }
    else {
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }
}
/**
 * Build a list for speech (e.g., "apples, oranges, and bananas")
 */
function speakList(items, conjunction = 'and') {
    if (items.length === 0)
        return '';
    if (items.length === 1)
        return items[0];
    if (items.length === 2)
        return `${items[0]} ${conjunction} ${items[1]}`;
    const lastItem = items[items.length - 1];
    const otherItems = items.slice(0, -1).join(', ');
    return `${otherItems}, ${conjunction} ${lastItem}`;
}
/**
 * Format a job for speech
 */
function speakJob(job, includeDate = false) {
    let speech = `${job.title} for ${speakSats(job.reward)}`;
    if (includeDate && job.createdAt) {
        speech += `, posted ${speakDate(job.createdAt)}`;
    }
    return speech;
}
/**
 * Create an ordinal (1st, 2nd, 3rd, etc.)
 */
function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
/**
 * Wrap text in SSML speak tags
 */
function ssml(text) {
    // Don't double-wrap
    if (text.startsWith('<speak>')) {
        return text;
    }
    return `<speak>${text}</speak>`;
}
/**
 * Strip SSML tags for card display
 */
function stripSSML(text) {
    return text
        .replace(/<speak>/g, '')
        .replace(/<\/speak>/g, '')
        .replace(/<[^>]+>/g, '');
}
//# sourceMappingURL=speech.js.map