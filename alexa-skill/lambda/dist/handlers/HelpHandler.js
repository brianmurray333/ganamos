"use strict";
/**
 * Help and Fallback Handlers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = exports.FallbackHandler = exports.SessionEndedHandler = exports.StopHandler = exports.HelpHandler = void 0;
/**
 * Help Intent Handler
 */
exports.HelpHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent');
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('I can help you manage jobs in your Ganamos group. ' +
            'You can say "list jobs" to see available jobs, ' +
            '"add a job" to create a new one, ' +
            'or tell me when someone completes a job, like "Marlowe cleaned the garage". ' +
            'You can also say "check my balance" to see your sats. ' +
            'What would you like to do?')
            .reprompt('What would you like to do?')
            .getResponse();
    },
};
/**
 * Stop Intent Handler
 */
exports.StopHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent' ||
                handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'));
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Goodbye! Keep up the great work fixing your community.')
            .getResponse();
    },
};
/**
 * Session Ended Handler
 */
exports.SessionEndedHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    async handle(handlerInput) {
        // Log session end reason for debugging
        const request = handlerInput.requestEnvelope.request;
        if (request.type === 'SessionEndedRequest') {
            console.log(`Session ended: ${request.reason}`);
            if (request.error) {
                console.error('Session error:', request.error);
            }
        }
        return handlerInput.responseBuilder.getResponse();
    },
};
/**
 * Fallback Handler
 */
exports.FallbackHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.FallbackIntent');
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak("I didn't quite understand that. " +
            'You can ask me to list jobs, add a job, or mark a job as complete. ' +
            'What would you like to do?')
            .reprompt('What would you like to do?')
            .getResponse();
    },
};
/**
 * Error Handler
 */
exports.ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.error('Error handled:', error.message);
        console.error('Error stack:', error.stack);
        return handlerInput.responseBuilder
            .speak("Sorry, I had trouble doing what you asked. Please try again.")
            .reprompt("Please try again.")
            .getResponse();
    },
};
//# sourceMappingURL=HelpHandler.js.map