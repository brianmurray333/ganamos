/**
 * Help and Fallback Handlers
 */

import { HandlerInput, RequestHandler, ErrorHandler as AskErrorHandler } from 'ask-sdk-core';
import { Response } from 'ask-sdk-model';

/**
 * Help Intent Handler
 */
export const HelpHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent'
    );
  },

  async handle(handlerInput: HandlerInput): Promise<Response> {
    return handlerInput.responseBuilder
      .speak(
        'I can help you manage jobs in your Ganamos group. ' +
        'You can say "list jobs" to see available jobs, ' +
        '"add a job" to create a new one, ' +
        'or tell me when someone completes a job, like "Marlowe cleaned the garage". ' +
        'You can also say "check my balance" to see your sats. ' +
        'What would you like to do?'
      )
      .reprompt('What would you like to do?')
      .getResponse();
  },
};

/**
 * Stop Intent Handler
 */
export const StopHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent' ||
        handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent')
    );
  },

  async handle(handlerInput: HandlerInput): Promise<Response> {
    return handlerInput.responseBuilder
      .speak('Goodbye! Keep up the great work fixing your community.')
      .getResponse();
  },
};

/**
 * Session Ended Handler
 */
export const SessionEndedHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },

  async handle(handlerInput: HandlerInput): Promise<Response> {
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
export const FallbackHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.FallbackIntent'
    );
  },

  async handle(handlerInput: HandlerInput): Promise<Response> {
    return handlerInput.responseBuilder
      .speak(
        "I didn't quite understand that. " +
        'You can ask me to list jobs, add a job, or mark a job as complete. ' +
        'What would you like to do?'
      )
      .reprompt('What would you like to do?')
      .getResponse();
  },
};

/**
 * Error Handler
 */
export const ErrorHandler: AskErrorHandler = {
  canHandle(): boolean {
    return true;
  },

  handle(handlerInput: HandlerInput, error: Error): Response {
    console.error('Error handled:', error.message);
    console.error('Error stack:', error.stack);

    return handlerInput.responseBuilder
      .speak("Sorry, I had trouble doing what you asked. Please try again.")
      .reprompt("Please try again.")
      .getResponse();
  },
};


