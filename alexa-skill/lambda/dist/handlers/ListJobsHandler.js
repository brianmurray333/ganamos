"use strict";
/**
 * List Jobs Intent Handler
 * Handles requests to list available jobs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadJobsYesHandler = exports.ListJobsHandler = void 0;
const ganamos_client_1 = require("../api/ganamos-client");
const speech_1 = require("../utils/speech");
exports.ListJobsHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'ListJobsIntent');
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
        try {
            const { jobs, totalCount, groupName } = await ganamos_client_1.ganamosClient.getJobs();
            if (totalCount === 0) {
                return handlerInput.responseBuilder
                    .speak(`There are no open jobs in ${groupName} right now. Would you like to add one?`)
                    .reprompt('Say "add a job" to create a new job.')
                    .getResponse();
            }
            // Store jobs in session for follow-up
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            sessionAttributes.jobs = jobs;
            sessionAttributes.currentJobIndex = 0;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            let speech = '';
            if (totalCount === 1) {
                const job = jobs[0];
                speech = `There is 1 open job in ${groupName}. ${(0, speech_1.pause)()} `;
                speech += `${(0, speech_1.speakJob)(job, true)}. `;
                speech += `Would you like to mark it as complete?`;
            }
            else {
                speech = `There are ${totalCount} open jobs in ${groupName}. ${(0, speech_1.pause)()} `;
                speech += `Would you like me to read them out to you?`;
            }
            return handlerInput.responseBuilder
                .speak(speech)
                .reprompt('Would you like me to read the jobs?')
                .getResponse();
        }
        catch (error) {
            console.error('List jobs error:', error);
            return handlerInput.responseBuilder
                .speak("I'm having trouble getting the job list right now. Please try again later.")
                .getResponse();
        }
    },
};
/**
 * Yes Intent Handler (for reading jobs)
 */
exports.ReadJobsYesHandler = {
    canHandle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent' &&
            sessionAttributes.jobs &&
            sessionAttributes.currentJobIndex !== undefined);
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const jobs = sessionAttributes.jobs;
        let speech = '';
        const maxJobs = Math.min(jobs.length, 5); // Read up to 5 jobs
        for (let i = 0; i < maxJobs; i++) {
            const job = jobs[i];
            speech += `${(0, speech_1.ordinal)(i + 1)}: ${(0, speech_1.speakJob)(job)}. ${(0, speech_1.pause)(0.8)} `;
        }
        if (jobs.length > maxJobs) {
            speech += `And ${jobs.length - maxJobs} more. `;
        }
        speech += `Would you like to mark any of these as complete?`;
        return handlerInput.responseBuilder
            .speak(speech)
            .reprompt('Say the job description and who completed it. For example, "Marlowe cleaned the garage".')
            .getResponse();
    },
};
//# sourceMappingURL=ListJobsHandler.js.map