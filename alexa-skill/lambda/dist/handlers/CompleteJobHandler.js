"use strict";
/**
 * Complete Job Intent Handler
 * Handles requests to mark a job as complete
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompleteJobCancelHandler = exports.CompleteJobConfirmHandler = exports.CompleteJobDisambiguationHandler = exports.CompleteJobHandler = void 0;
const ganamos_client_1 = require("../api/ganamos-client");
const speech_1 = require("../utils/speech");
/**
 * Find matching jobs based on spoken description
 */
function findMatchingJobs(jobs, spokenDescription) {
    const normalized = spokenDescription.toLowerCase().trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 2);
    // Score each job by how many words match
    const scoredJobs = jobs.map(job => {
        const titleWords = job.title.toLowerCase().split(/\s+/);
        const descWords = job.description.toLowerCase().split(/\s+/);
        const allWords = [...titleWords, ...descWords];
        let score = 0;
        for (const word of words) {
            if (allWords.some(w => w.includes(word) || word.includes(w))) {
                score++;
            }
        }
        // Bonus for exact substring match
        if (job.title.toLowerCase().includes(normalized) ||
            job.description.toLowerCase().includes(normalized)) {
            score += 3;
        }
        return { job, score };
    });
    // Return jobs with score > 0, sorted by score descending
    return scoredJobs
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(s => s.job);
}
exports.CompleteJobHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'CompleteJobIntent');
    },
    async handle(handlerInput) {
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        if (!accessToken) {
            return handlerInput.responseBuilder
                .speak('Please link your Ganamos account first.')
                .withLinkAccountCard()
                .getResponse();
        }
        ganamos_client_1.ganamosClient.setAccessToken(accessToken);
        const request = handlerInput.requestEnvelope.request;
        const slots = request.intent.slots;
        const fixerName = slots?.FixerName?.value;
        const jobDescription = slots?.JobDescription?.value;
        // Check if we have the fixer name
        if (!fixerName) {
            return handlerInput.responseBuilder
                .speak('Who completed the job?')
                .reprompt('Please tell me who completed the job.')
                .addElicitSlotDirective('FixerName')
                .getResponse();
        }
        // If no job description, need to identify the job
        if (!jobDescription) {
            // Check if there's only one job - auto-select it
            try {
                const { jobs } = await ganamos_client_1.ganamosClient.getJobs();
                if (jobs.length === 0) {
                    return handlerInput.responseBuilder
                        .speak("There are no open jobs to mark as complete.")
                        .getResponse();
                }
                if (jobs.length === 1) {
                    // Only one job, confirm completion
                    const job = jobs[0];
                    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                    sessionAttributes.pendingComplete = {
                        jobId: job.id,
                        jobTitle: job.title,
                        reward: job.reward,
                        fixerName: fixerName,
                    };
                    sessionAttributes.awaitingConfirmation = 'completeJob';
                    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                    return handlerInput.responseBuilder
                        .speak(`I found the job "${job.title}" for ${(0, speech_1.speakSats)(job.reward)}. ` +
                        `Should I mark it as complete and assign it to ${fixerName}?`)
                        .reprompt(`Should I mark "${job.title}" as complete?`)
                        .getResponse();
                }
                // Multiple jobs, need to ask which one
                return handlerInput.responseBuilder
                    .speak(`There are ${jobs.length} open jobs. Which one did ${fixerName} complete?`)
                    .reprompt('Which job was completed?')
                    .addElicitSlotDirective('JobDescription')
                    .getResponse();
            }
            catch (error) {
                console.error('Complete job error:', error);
                return handlerInput.responseBuilder
                    .speak("I'm having trouble right now. Please try again later.")
                    .getResponse();
            }
        }
        // We have both fixer and job description - find the job
        try {
            const { jobs } = await ganamos_client_1.ganamosClient.getJobs();
            const matchingJobs = findMatchingJobs(jobs, jobDescription);
            if (matchingJobs.length === 0) {
                return handlerInput.responseBuilder
                    .speak(`I couldn't find an open job matching "${jobDescription}". ` +
                    `Would you like me to list the available jobs?`)
                    .reprompt('Would you like me to list the jobs?')
                    .getResponse();
            }
            if (matchingJobs.length === 1) {
                // Found exactly one match
                const job = matchingJobs[0];
                const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                sessionAttributes.pendingComplete = {
                    jobId: job.id,
                    jobTitle: job.title,
                    reward: job.reward,
                    fixerName: fixerName,
                };
                sessionAttributes.awaitingConfirmation = 'completeJob';
                handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                return handlerInput.responseBuilder
                    .speak(`I found the job "${job.title}" for ${(0, speech_1.speakSats)(job.reward)}. ` +
                    `Should I mark it as complete and assign it to ${fixerName}?`)
                    .reprompt(`Should I mark "${job.title}" as complete?`)
                    .getResponse();
            }
            // Multiple matches - need disambiguation
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            sessionAttributes.disambiguationJobs = matchingJobs.slice(0, 3);
            sessionAttributes.pendingFixerName = fixerName;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            let speech = `I found ${matchingJobs.length} jobs that could match. ${(0, speech_1.pause)()} `;
            // Describe up to 2 jobs for disambiguation
            if (matchingJobs.length >= 2) {
                const job1 = matchingJobs[0];
                const job2 = matchingJobs[1];
                speech += `The first one is "${job1.title}" for ${(0, speech_1.speakSats)(job1.reward)}, ` +
                    `created ${(0, speech_1.speakDate)(job1.createdAt)}. ${(0, speech_1.pause)()} `;
                speech += `The second one is "${job2.title}" for ${(0, speech_1.speakSats)(job2.reward)}, ` +
                    `created ${(0, speech_1.speakDate)(job2.createdAt)}. ${(0, speech_1.pause)()} `;
                speech += `Are you referring to the first or second?`;
            }
            return handlerInput.responseBuilder
                .speak(speech)
                .reprompt('Please say first or second.')
                .getResponse();
        }
        catch (error) {
            console.error('Complete job error:', error);
            return handlerInput.responseBuilder
                .speak("I'm having trouble right now. Please try again later.")
                .getResponse();
        }
    },
};
/**
 * Disambiguation handler - user says "first" or "second"
 */
exports.CompleteJobDisambiguationHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const request = handlerInput.requestEnvelope.request;
        if (request.type !== 'IntentRequest')
            return false;
        if (!sessionAttributes.disambiguationJobs)
            return false;
        // Handle ordinal responses
        return (request.intent.name === 'SelectOptionIntent' ||
            request.intent.name === 'AMAZON.SelectIntent');
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const jobs = sessionAttributes.disambiguationJobs;
        const fixerName = sessionAttributes.pendingFixerName;
        const request = handlerInput.requestEnvelope.request;
        const slots = request.intent.slots;
        const selection = slots?.ListPosition?.value || slots?.OptionNumber?.value || '1';
        const index = selection.toLowerCase() === 'second' ? 1 :
            selection.toLowerCase() === 'first' ? 0 :
                parseInt(selection, 10) - 1;
        if (index < 0 || index >= jobs.length) {
            return handlerInput.responseBuilder
                .speak('Please say first or second.')
                .reprompt('First or second?')
                .getResponse();
        }
        const job = jobs[index];
        // Clear disambiguation state
        delete sessionAttributes.disambiguationJobs;
        delete sessionAttributes.pendingFixerName;
        // Set up confirmation
        sessionAttributes.pendingComplete = {
            jobId: job.id,
            jobTitle: job.title,
            reward: job.reward,
            fixerName: fixerName,
        };
        sessionAttributes.awaitingConfirmation = 'completeJob';
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
            .speak(`Okay, "${job.title}" for ${(0, speech_1.speakSats)(job.reward)}. ` +
            `Should I mark it as complete and assign it to ${fixerName}?`)
            .reprompt('Should I mark this job as complete?')
            .getResponse();
    },
};
/**
 * Confirmation handler for completing a job
 */
exports.CompleteJobConfirmHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent' &&
            sessionAttributes.awaitingConfirmation === 'completeJob' &&
            sessionAttributes.pendingComplete);
    },
    async handle(handlerInput) {
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        if (!accessToken) {
            return handlerInput.responseBuilder
                .speak('Please link your Ganamos account first.')
                .withLinkAccountCard()
                .getResponse();
        }
        ganamos_client_1.ganamosClient.setAccessToken(accessToken);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const { jobId, jobTitle, reward, fixerName } = sessionAttributes.pendingComplete;
        // Clear the pending state
        delete sessionAttributes.pendingComplete;
        delete sessionAttributes.awaitingConfirmation;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        try {
            const result = await ganamos_client_1.ganamosClient.completeJob(jobId, fixerName);
            if (!result.success) {
                return handlerInput.responseBuilder
                    .speak(result.error || "I couldn't complete the job. Please try again.")
                    .getResponse();
            }
            if (result.requiresVerification) {
                // Job requires owner verification
                return handlerInput.responseBuilder
                    .speak(result.message ||
                    `The job "${jobTitle}" was posted by someone else. ` +
                        `An email has been sent to verify that ${fixerName} completed it.`)
                    .getResponse();
            }
            // Job was completed successfully
            return handlerInput.responseBuilder
                .speak(result.message ||
                `Done! The job "${jobTitle}" has been marked complete and ` +
                    `${fixerName} has been awarded ${(0, speech_1.speakSats)(reward)}.`)
                .getResponse();
        }
        catch (error) {
            console.error('Complete job error:', error);
            return handlerInput.responseBuilder
                .speak("I'm having trouble completing the job right now. Please try again later.")
                .getResponse();
        }
    },
};
/**
 * Cancel handler for completing a job
 */
exports.CompleteJobCancelHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NoIntent' &&
            sessionAttributes.awaitingConfirmation === 'completeJob');
    },
    async handle(handlerInput) {
        // Clear the pending state
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        delete sessionAttributes.pendingComplete;
        delete sessionAttributes.awaitingConfirmation;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
            .speak("Okay, I won't mark that job as complete. Is there anything else I can help you with?")
            .reprompt('What would you like to do?')
            .getResponse();
    },
};
//# sourceMappingURL=CompleteJobHandler.js.map