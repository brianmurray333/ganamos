"use strict";
/**
 * Launch Request Handler
 * Triggered when user says "Alexa, open Ganamos"
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LaunchHandler = void 0;
const ganamos_client_1 = require("../api/ganamos-client");
const speech_1 = require("../utils/speech");
exports.LaunchHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;
        // Check if account is linked
        if (!accessToken) {
            return handlerInput.responseBuilder
                .speak('Welcome to Ganamos! To get started, please link your Ganamos account in the Alexa app.')
                .withLinkAccountCard()
                .getResponse();
        }
        // Set the access token
        ganamos_client_1.ganamosClient.setAccessToken(accessToken);
        try {
            // Fetch user info and jobs count
            const [balanceData, jobsData] = await Promise.all([
                ganamos_client_1.ganamosClient.getBalance(),
                ganamos_client_1.ganamosClient.getJobs(),
            ]);
            const { balance, name } = balanceData;
            const { totalCount, groupName } = jobsData;
            let greeting = `Welcome back${name ? `, ${name}` : ''}! `;
            greeting += `You have ${(0, speech_1.speakSats)(balance)}. `;
            if (totalCount === 0) {
                greeting += `There are no open jobs in ${groupName} right now. `;
                greeting += 'You can say "add a job" to create one.';
            }
            else if (totalCount === 1) {
                greeting += `There is 1 open job in ${groupName}. `;
                greeting += 'Would you like me to tell you about it?';
            }
            else {
                greeting += `There are ${totalCount} open jobs in ${groupName}. `;
                greeting += 'Would you like me to read them?';
            }
            return handlerInput.responseBuilder
                .speak(greeting)
                .reprompt('You can say "list jobs", "add a job", or "check my balance".')
                .getResponse();
        }
        catch (error) {
            console.error('Launch error:', error);
            return handlerInput.responseBuilder
                .speak("Welcome to Ganamos! I'm having trouble connecting right now. Please try again in a moment.")
                .getResponse();
        }
    },
};
//# sourceMappingURL=LaunchHandler.js.map