/**
 * Ganamos Alexa Skill - Main Entry Point
 * 
 * This skill allows users to manage jobs in their Ganamos group via voice.
 * 
 * Features:
 * - List open jobs
 * - Add new jobs
 * - Mark jobs as complete
 * - Check balance
 */

import { SkillBuilders } from 'ask-sdk-core';

// Import handlers
import { LaunchHandler } from './handlers/LaunchHandler';
import { ListJobsHandler, ReadJobsYesHandler } from './handlers/ListJobsHandler';
import { AddJobHandler, AddJobConfirmHandler, AddJobCancelHandler } from './handlers/AddJobHandler';
import {
  CompleteJobHandler,
  CompleteJobDisambiguationHandler,
  CompleteJobConfirmHandler,
  CompleteJobCancelHandler,
} from './handlers/CompleteJobHandler';
import { BalanceHandler } from './handlers/BalanceHandler';
import {
  HelpHandler,
  StopHandler,
  SessionEndedHandler,
  FallbackHandler,
  ErrorHandler,
} from './handlers/HelpHandler';

/**
 * Build the skill
 * 
 * Handler order matters - more specific handlers should come before general ones.
 * The first handler that can handle the request will be used.
 */
export const handler = SkillBuilders.custom()
  .addRequestHandlers(
    // Launch
    LaunchHandler,

    // Job listing
    ListJobsHandler,
    ReadJobsYesHandler,

    // Add job flow
    AddJobHandler,
    AddJobConfirmHandler,
    AddJobCancelHandler,

    // Complete job flow
    CompleteJobHandler,
    CompleteJobDisambiguationHandler,
    CompleteJobConfirmHandler,
    CompleteJobCancelHandler,

    // Balance
    BalanceHandler,

    // Standard intents
    HelpHandler,
    StopHandler,
    SessionEndedHandler,
    FallbackHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent('ganamos-alexa-skill/1.0.0')
  .lambda();


