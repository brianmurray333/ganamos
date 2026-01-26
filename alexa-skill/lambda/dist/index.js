"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const ask_sdk_core_1 = require("ask-sdk-core");
// Import handlers
const LaunchHandler_1 = require("./handlers/LaunchHandler");
const ListJobsHandler_1 = require("./handlers/ListJobsHandler");
const AddJobHandler_1 = require("./handlers/AddJobHandler");
const CompleteJobHandler_1 = require("./handlers/CompleteJobHandler");
const BalanceHandler_1 = require("./handlers/BalanceHandler");
const HelpHandler_1 = require("./handlers/HelpHandler");
/**
 * Build the skill
 *
 * Handler order matters - more specific handlers should come before general ones.
 * The first handler that can handle the request will be used.
 */
exports.handler = ask_sdk_core_1.SkillBuilders.custom()
    .addRequestHandlers(
// Launch
LaunchHandler_1.LaunchHandler, 
// Job listing
ListJobsHandler_1.ListJobsHandler, ListJobsHandler_1.ReadJobsYesHandler, 
// Add job flow
AddJobHandler_1.AddJobHandler, AddJobHandler_1.AddJobConfirmHandler, AddJobHandler_1.AddJobCancelHandler, 
// Complete job flow
CompleteJobHandler_1.CompleteJobHandler, CompleteJobHandler_1.CompleteJobDisambiguationHandler, CompleteJobHandler_1.CompleteJobConfirmHandler, CompleteJobHandler_1.CompleteJobCancelHandler, 
// Balance
BalanceHandler_1.BalanceHandler, 
// Standard intents
HelpHandler_1.HelpHandler, HelpHandler_1.StopHandler, HelpHandler_1.SessionEndedHandler, HelpHandler_1.FallbackHandler)
    .addErrorHandlers(HelpHandler_1.ErrorHandler)
    .withCustomUserAgent('ganamos-alexa-skill/1.0.0')
    .lambda();
//# sourceMappingURL=index.js.map