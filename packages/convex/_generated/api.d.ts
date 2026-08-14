/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_access from "../agent/access.js";
import type * as agent_approvalInvalidation from "../agent/approvalInvalidation.js";
import type * as agent_auditModel from "../agent/auditModel.js";
import type * as agent_builtInTools from "../agent/builtInTools.js";
import type * as agent_customToolModel from "../agent/customToolModel.js";
import type * as agent_customTools from "../agent/customTools.js";
import type * as agent_leases from "../agent/leases.js";
import type * as agent_model from "../agent/model.js";
import type * as agent_push from "../agent/push.js";
import type * as agent_reader from "../agent/reader.js";
import type * as agent_runFinalization from "../agent/runFinalization.js";
import type * as agent_runtime from "../agent/runtime.js";
import type * as agent_runtimeValues from "../agent/runtimeValues.js";
import type * as agent_tasks from "../agent/tasks.js";
import type * as agent_toolDomains_cases from "../agent/toolDomains/cases.js";
import type * as agent_toolDomains_discovery from "../agent/toolDomains/discovery.js";
import type * as agent_toolDomains_email from "../agent/toolDomains/email.js";
import type * as agent_toolDomains_shared from "../agent/toolDomains/shared.js";
import type * as agent_toolLedger from "../agent/toolLedger.js";
import type * as agent_toolReadModel from "../agent/toolReadModel.js";
import type * as agent_tools from "../agent/tools.js";
import type * as agent_transcript from "../agent/transcript.js";
import type * as auth_access from "../auth/access.js";
import type * as auth_members from "../auth/members.js";
import type * as case_access from "../case/access.js";
import type * as case_agentOwnership from "../case/agentOwnership.js";
import type * as case_deletion from "../case/deletion.js";
import type * as case_emailRelations from "../case/emailRelations.js";
import type * as case_embedding from "../case/embedding.js";
import type * as case_embeddingData from "../case/embeddingData.js";
import type * as case_embeddingModel from "../case/embeddingModel.js";
import type * as case_events from "../case/events.js";
import type * as case_input from "../case/input.js";
import type * as case_model from "../case/model.js";
import type * as case_mutations from "../case/mutations.js";
import type * as case_reader from "../case/reader.js";
import type * as case_reference from "../case/reference.js";
import type * as case_relations from "../case/relations.js";
import type * as contact_model from "../contact/model.js";
import type * as contact_reader from "../contact/reader.js";
import type * as crons from "../crons.js";
import type * as domainEvents from "../domainEvents.js";
import type * as email_inboxes from "../email/inboxes.js";
import type * as email_ingest from "../email/ingest.js";
import type * as email_ingestErrors from "../email/ingestErrors.js";
import type * as email_ingestOperations from "../email/ingestOperations.js";
import type * as email_ingestQueue from "../email/ingestQueue.js";
import type * as email_ingestRecipients from "../email/ingestRecipients.js";
import type * as email_ingestState from "../email/ingestState.js";
import type * as email_input from "../email/input.js";
import type * as email_integrationActions from "../email/integrationActions.js";
import type * as email_integrations from "../email/integrations.js";
import type * as email_model from "../email/model.js";
import type * as email_normalize from "../email/normalize.js";
import type * as email_outbound from "../email/outbound.js";
import type * as email_outboundDomainModel from "../email/outboundDomainModel.js";
import type * as email_outboundDomains from "../email/outboundDomains.js";
import type * as email_outboundModel from "../email/outboundModel.js";
import type * as email_outboundProvider from "../email/outboundProvider.js";
import type * as email_outboundQueue from "../email/outboundQueue.js";
import type * as email_outboundResendProvider from "../email/outboundResendProvider.js";
import type * as email_outboundWorker from "../email/outboundWorker.js";
import type * as email_reader from "../email/reader.js";
import type * as email_resend from "../email/resend.js";
import type * as email_resendAccess from "../email/resendAccess.js";
import type * as email_router from "../email/router.js";
import type * as email_unreadCounts from "../email/unreadCounts.js";
import type * as email_webhookVerification from "../email/webhookVerification.js";
import type * as entity_constants from "../entity/constants.js";
import type * as entity_deletion from "../entity/deletion.js";
import type * as entity_input from "../entity/input.js";
import type * as entity_model from "../entity/model.js";
import type * as entity_mutations from "../entity/mutations.js";
import type * as entity_reader from "../entity/reader.js";
import type * as entity_values from "../entity/values.js";
import type * as globalSearch_model from "../globalSearch/model.js";
import type * as globalSearch_reader from "../globalSearch/reader.js";
import type * as http from "../http.js";
import type * as integrations_connectedAccounts from "../integrations/connectedAccounts.js";
import type * as integrations_model from "../integrations/model.js";
import type * as integrations_reconcileActions from "../integrations/reconcileActions.js";
import type * as integrations_resendProvider from "../integrations/resendProvider.js";
import type * as integrations_workosAccess from "../integrations/workosAccess.js";
import type * as migrations from "../migrations.js";
import type * as organization_input from "../organization/input.js";
import type * as organization_settings from "../organization/settings.js";
import type * as seed_acme from "../seed/acme.js";
import type * as seed_acmeData from "../seed/acmeData.js";
import type * as seed_acmeReplacement from "../seed/acmeReplacement.js";
import type * as workos from "../workos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/access": typeof agent_access;
  "agent/approvalInvalidation": typeof agent_approvalInvalidation;
  "agent/auditModel": typeof agent_auditModel;
  "agent/builtInTools": typeof agent_builtInTools;
  "agent/customToolModel": typeof agent_customToolModel;
  "agent/customTools": typeof agent_customTools;
  "agent/leases": typeof agent_leases;
  "agent/model": typeof agent_model;
  "agent/push": typeof agent_push;
  "agent/reader": typeof agent_reader;
  "agent/runFinalization": typeof agent_runFinalization;
  "agent/runtime": typeof agent_runtime;
  "agent/runtimeValues": typeof agent_runtimeValues;
  "agent/tasks": typeof agent_tasks;
  "agent/toolDomains/cases": typeof agent_toolDomains_cases;
  "agent/toolDomains/discovery": typeof agent_toolDomains_discovery;
  "agent/toolDomains/email": typeof agent_toolDomains_email;
  "agent/toolDomains/shared": typeof agent_toolDomains_shared;
  "agent/toolLedger": typeof agent_toolLedger;
  "agent/toolReadModel": typeof agent_toolReadModel;
  "agent/tools": typeof agent_tools;
  "agent/transcript": typeof agent_transcript;
  "auth/access": typeof auth_access;
  "auth/members": typeof auth_members;
  "case/access": typeof case_access;
  "case/agentOwnership": typeof case_agentOwnership;
  "case/deletion": typeof case_deletion;
  "case/emailRelations": typeof case_emailRelations;
  "case/embedding": typeof case_embedding;
  "case/embeddingData": typeof case_embeddingData;
  "case/embeddingModel": typeof case_embeddingModel;
  "case/events": typeof case_events;
  "case/input": typeof case_input;
  "case/model": typeof case_model;
  "case/mutations": typeof case_mutations;
  "case/reader": typeof case_reader;
  "case/reference": typeof case_reference;
  "case/relations": typeof case_relations;
  "contact/model": typeof contact_model;
  "contact/reader": typeof contact_reader;
  crons: typeof crons;
  domainEvents: typeof domainEvents;
  "email/inboxes": typeof email_inboxes;
  "email/ingest": typeof email_ingest;
  "email/ingestErrors": typeof email_ingestErrors;
  "email/ingestOperations": typeof email_ingestOperations;
  "email/ingestQueue": typeof email_ingestQueue;
  "email/ingestRecipients": typeof email_ingestRecipients;
  "email/ingestState": typeof email_ingestState;
  "email/input": typeof email_input;
  "email/integrationActions": typeof email_integrationActions;
  "email/integrations": typeof email_integrations;
  "email/model": typeof email_model;
  "email/normalize": typeof email_normalize;
  "email/outbound": typeof email_outbound;
  "email/outboundDomainModel": typeof email_outboundDomainModel;
  "email/outboundDomains": typeof email_outboundDomains;
  "email/outboundModel": typeof email_outboundModel;
  "email/outboundProvider": typeof email_outboundProvider;
  "email/outboundQueue": typeof email_outboundQueue;
  "email/outboundResendProvider": typeof email_outboundResendProvider;
  "email/outboundWorker": typeof email_outboundWorker;
  "email/reader": typeof email_reader;
  "email/resend": typeof email_resend;
  "email/resendAccess": typeof email_resendAccess;
  "email/router": typeof email_router;
  "email/unreadCounts": typeof email_unreadCounts;
  "email/webhookVerification": typeof email_webhookVerification;
  "entity/constants": typeof entity_constants;
  "entity/deletion": typeof entity_deletion;
  "entity/input": typeof entity_input;
  "entity/model": typeof entity_model;
  "entity/mutations": typeof entity_mutations;
  "entity/reader": typeof entity_reader;
  "entity/values": typeof entity_values;
  "globalSearch/model": typeof globalSearch_model;
  "globalSearch/reader": typeof globalSearch_reader;
  http: typeof http;
  "integrations/connectedAccounts": typeof integrations_connectedAccounts;
  "integrations/model": typeof integrations_model;
  "integrations/reconcileActions": typeof integrations_reconcileActions;
  "integrations/resendProvider": typeof integrations_resendProvider;
  "integrations/workosAccess": typeof integrations_workosAccess;
  migrations: typeof migrations;
  "organization/input": typeof organization_input;
  "organization/settings": typeof organization_settings;
  "seed/acme": typeof seed_acme;
  "seed/acmeData": typeof seed_acmeData;
  "seed/acmeReplacement": typeof seed_acmeReplacement;
  workos: typeof workos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workOSAuthKit: import("@convex-dev/workos-authkit/_generated/component.js").ComponentApi<"workOSAuthKit">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  actionCache: import("@convex-dev/action-cache/_generated/component.js").ComponentApi<"actionCache">;
  emailIngestWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"emailIngestWorkpool">;
  emailOutboundWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"emailOutboundWorkpool">;
};
