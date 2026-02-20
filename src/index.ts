/**
 * Arrow Flight SQL client for JavaScript and TypeScript.
 *
 * Provides SQL-specific functionality on top of Arrow Flight for database
 * interactions including query execution, updates, and metadata queries.
 *
 * @packageDocumentation
 */

// Client
export type {
  FlightSqlClientOptions,
  PreparedStatementOptions,
  PreparedStatementResult,
  QueryOptions,
  UpdateResult
} from "./client.js"
export { createFlightSqlClient, FlightSqlClient } from "./client.js"

// Result set utilities
export type { ResultIteratorOptions } from "./results.js"
export { flightInfoToTable, iterateResults, queryToTable, ticketToTable } from "./results.js"

// Re-export base Flight client types for convenience
export {
  type CallOptions,
  type FlightClientOptions,
  type FlightData,
  FlightError,
  type FlightInfo,
  type Ticket
} from "@qualithm/arrow-flight-js"
