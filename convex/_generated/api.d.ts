/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as email_connections from "../email/connections.js";
import type * as email_ingest from "../email/ingest.js";
import type * as email_model from "../email/model.js";
import type * as email_normalize from "../email/normalize.js";
import type * as email_reader from "../email/reader.js";
import type * as email_resend from "../email/resend.js";
import type * as http from "../http.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "email/connections": typeof email_connections;
  "email/ingest": typeof email_ingest;
  "email/model": typeof email_model;
  "email/normalize": typeof email_normalize;
  "email/reader": typeof email_reader;
  "email/resend": typeof email_resend;
  http: typeof http;
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

export declare const components: {};
