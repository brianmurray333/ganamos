/**
 * Add Job Intent Handler
 * Handles requests to create a new job
 */

import { HandlerInput, RequestHandler } from 'ask-sdk-core';
import { Response, IntentRequest } from 'ask-sdk-model';
import { ganamosClient } from '../api/ganamos-client';
import { speakSats } from '../utils/speech';

/**
 * Initial handler for AddJobIntent
 * Captures job description and reward, then asks for confirmation
 */
export const AddJobHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AddJobIntent'
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

    const request = handlerInput.requestEnvelope.request as IntentRequest;
    const slots = request.intent.slots;

    // Get slot values
    const jobDescription = slots?.JobDescription?.value;
    const rewardAmount = slots?.RewardAmount?.value;

    // Check if we have all required slots
    if (!jobDescription) {
      return handlerInput.responseBuilder
        .speak('What job would you like to add?')
        .reprompt('Please describe the job you want to add.')
        .addElicitSlotDirective('JobDescription')
        .getResponse();
    }

    if (!rewardAmount) {
      return handlerInput.responseBuilder
        .speak(`Got it, "${jobDescription}". How many sats would you like to offer as a reward?`)
        .reprompt('How many sats for the reward?')
        .addElicitSlotDirective('RewardAmount')
        .getResponse();
    }

    const reward = parseInt(rewardAmount, 10);

    if (isNaN(reward) || reward <= 0) {
      return handlerInput.responseBuilder
        .speak('Please specify a valid reward amount in sats.')
        .reprompt('How many sats would you like to offer?')
        .addElicitSlotDirective('RewardAmount')
        .getResponse();
    }

    // Check balance before confirming
    try {
      const { balance } = await ganamosClient.getBalance();

      if (balance < reward) {
        return handlerInput.responseBuilder
          .speak(
            `I can't create this job because you don't have enough sats. ` +
            `You have ${speakSats(balance)}, but this job requires ${speakSats(reward)}. ` +
            `Would you like to create a job with a smaller reward?`
          )
          .reprompt('Would you like to try with a smaller reward?')
          .getResponse();
      }

      // Store job details in session for confirmation
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.pendingJob = {
        description: jobDescription,
        reward: reward,
      };
      sessionAttributes.awaitingConfirmation = 'addJob';
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(
          `I'll add a job for "${jobDescription}" with a reward of ${speakSats(reward)}. ` +
          `This will deduct ${speakSats(reward)} from your balance of ${speakSats(balance)}. ` +
          `Should I proceed?`
        )
        .reprompt('Should I add this job?')
        .getResponse();
    } catch (error) {
      console.error('Add job error:', error);
      return handlerInput.responseBuilder
        .speak("I'm having trouble right now. Please try again later.")
        .getResponse();
    }
  },
};

/**
 * Confirmation handler for adding a job
 */
export const AddJobConfirmHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent' &&
      sessionAttributes.awaitingConfirmation === 'addJob' &&
      sessionAttributes.pendingJob
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

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const { description, reward } = sessionAttributes.pendingJob;

    // Clear the pending state
    delete sessionAttributes.pendingJob;
    delete sessionAttributes.awaitingConfirmation;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    try {
      const result = await ganamosClient.createJob(description, reward);

      if (!result.success) {
        // Check for insufficient balance error
        if (result.balance !== undefined && result.required !== undefined) {
          return handlerInput.responseBuilder
            .speak(
              `I couldn't create the job because you don't have enough sats. ` +
              `You have ${speakSats(result.balance)}, but need ${speakSats(result.required)}.`
            )
            .getResponse();
        }

        return handlerInput.responseBuilder
          .speak(`I couldn't add the job. ${result.error || 'Please try again later.'}`)
          .getResponse();
      }

      return handlerInput.responseBuilder
        .speak(
          `Done! I've added the job "${result.job?.title || description}" for ${speakSats(reward)}. ` +
          `Your new balance is ${speakSats(result.newBalance || 0)}.`
        )
        .getResponse();
    } catch (error) {
      console.error('Create job error:', error);
      return handlerInput.responseBuilder
        .speak("I'm having trouble creating the job right now. Please try again later.")
        .getResponse();
    }
  },
};

/**
 * Cancel handler for adding a job
 */
export const AddJobCancelHandler: RequestHandler = {
  canHandle(handlerInput: HandlerInput): boolean {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    return (
      handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
      handlerInput.requestEnvelope.request.intent.name === 'AMAZON.NoIntent' &&
      sessionAttributes.awaitingConfirmation === 'addJob'
    );
  },

  async handle(handlerInput: HandlerInput): Promise<Response> {
    // Clear the pending state
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    delete sessionAttributes.pendingJob;
    delete sessionAttributes.awaitingConfirmation;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    return handlerInput.responseBuilder
      .speak("Okay, I won't add that job. Is there anything else I can help you with?")
      .reprompt('What would you like to do?')
      .getResponse();
  },
};


