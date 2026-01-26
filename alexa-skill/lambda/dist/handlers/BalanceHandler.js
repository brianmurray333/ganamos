"use strict";
/**
 * Balance Intent Handler
 * Handles requests to check user's sat balance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceHandler = void 0;
const ganamos_client_1 = require("../api/ganamos-client");
const speech_1 = require("../utils/speech");
exports.BalanceHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'BalanceIntent');
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
            const { balance, name } = await ganamos_client_1.ganamosClient.getBalance();
            return handlerInput.responseBuilder
                .speak(`${name ? `${name}, you` : 'You'} have ${(0, speech_1.speakSats)(balance)}.`)
                .getResponse();
        }
        catch (error) {
            console.error('Balance error:', error);
            return handlerInput.responseBuilder
                .speak("I'm having trouble checking your balance right now. Please try again later.")
                .getResponse();
        }
    },
};
//# sourceMappingURL=BalanceHandler.js.map