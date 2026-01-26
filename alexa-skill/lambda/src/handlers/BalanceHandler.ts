/**
 * Balance Intent Handler
 * Handles requests to check user's sat balance
 */

import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';
import { ganamosClient } from '../api/ganamos-client';
import { speakSats } from '../utils/speech';

export const BalanceHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'BalanceIntent'
    );
  },

  async handle(handlerInput: HandlerInput): Promise<Response> {
    const accessToken = handlerInput.requestEnvelope.context.System.user.accessToken;

    if (!accessToken) {
      return handlerInput.responseBuilder
        .speak('Please link your Ganamos account first.')
        .withLinkAccountCard()
        .getResponse();
    }

    ganamosClient.setAccessToken(accessToken);

    try {
      const { balance, name } = await ganamosClient.getBalance();

      return handlerInput.responseBuilder
        .speak(`${name ? `${name}, you` : 'You'} have ${speakSats(balance)}.`)
        .getResponse();
    } catch (error) {
      console.error('Balance error:', error);
      return handlerInput.responseBuilder
        .speak("I'm having trouble checking your balance right now. Please try again later.")
        .getResponse();
    }
  },
};


