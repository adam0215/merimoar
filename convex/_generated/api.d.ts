/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth_access from "../auth/access.js";
import type * as auth_members from "../auth/members.js";
import type * as case_access from "../case/access.js";
import type * as case_events from "../case/events.js";
import type * as case_input from "../case/input.js";
import type * as case_model from "../case/model.js";
import type * as case_mutations from "../case/mutations.js";
import type * as case_reader from "../case/reader.js";
import type * as case_relations from "../case/relations.js";
import type * as contact_model from "../contact/model.js";
import type * as contact_reader from "../contact/reader.js";
import type * as email_connections from "../email/connections.js";
import type * as email_ingest from "../email/ingest.js";
import type * as email_input from "../email/input.js";
import type * as email_model from "../email/model.js";
import type * as email_normalize from "../email/normalize.js";
import type * as email_reader from "../email/reader.js";
import type * as email_resend from "../email/resend.js";
import type * as entity_constants from "../entity/constants.js";
import type * as entity_input from "../entity/input.js";
import type * as entity_model from "../entity/model.js";
import type * as entity_mutations from "../entity/mutations.js";
import type * as entity_reader from "../entity/reader.js";
import type * as entity_values from "../entity/values.js";
import type * as globalSearch_model from "../globalSearch/model.js";
import type * as globalSearch_reader from "../globalSearch/reader.js";
import type * as http from "../http.js";
import type * as workos from "../workos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "auth/access": typeof auth_access;
  "auth/members": typeof auth_members;
  "case/access": typeof case_access;
  "case/events": typeof case_events;
  "case/input": typeof case_input;
  "case/model": typeof case_model;
  "case/mutations": typeof case_mutations;
  "case/reader": typeof case_reader;
  "case/relations": typeof case_relations;
  "contact/model": typeof contact_model;
  "contact/reader": typeof contact_reader;
  "email/connections": typeof email_connections;
  "email/ingest": typeof email_ingest;
  "email/input": typeof email_input;
  "email/model": typeof email_model;
  "email/normalize": typeof email_normalize;
  "email/reader": typeof email_reader;
  "email/resend": typeof email_resend;
  "entity/constants": typeof entity_constants;
  "entity/input": typeof entity_input;
  "entity/model": typeof entity_model;
  "entity/mutations": typeof entity_mutations;
  "entity/reader": typeof entity_reader;
  "entity/values": typeof entity_values;
  "globalSearch/model": typeof globalSearch_model;
  "globalSearch/reader": typeof globalSearch_reader;
  http: typeof http;
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
};
