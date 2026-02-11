/**
 * Transport Abstraction
 *
 * Defines runtime-agnostic types for gRPC transport operations.
 * Enables different implementations for different runtimes:
 * - Node.js/Bun: @grpc/grpc-js
 * - Browser/Workers: gRPC-web
 * - Deno: Native HTTP/2 or gRPC-web
 */

/**
 * Metadata for gRPC requests (similar to HTTP headers)
 */
export type TransportMetadata = Record<string, string | string[]>

/**
 * Connection options for transport
 */
export type TransportOptions = {
  /** Host address */
  host: string
  /** Port number */
  port: number
  /** Whether to use TLS */
  tls: boolean
  /** Custom TLS credentials (runtime-specific) */
  credentials?: unknown
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number
  /** Request timeout in milliseconds */
  requestTimeoutMs?: number
}

/**
 * Error from transport layer with gRPC status info
 */
export type TransportError = Error & {
  /** gRPC status code */
  code?: number
  /** Additional error details */
  details?: string
  /** Error metadata */
  metadata?: TransportMetadata
}

// ============================================================================
// Stream Types
// ============================================================================

/**
 * Readable stream from server (server streaming or bidirectional)
 */
export type ReadableStream<T> = AsyncIterable<T> & {
  /** Cancel the stream */
  cancel: () => void
}

/**
 * Writable stream to server (client streaming or bidirectional)
 */
export type WritableStream<T> = {
  /** Write a message to the stream */
  write: (message: T) => boolean
  /** End the stream (no more writes) */
  end: () => void
}

/**
 * Bidirectional stream (full duplex)
 */
export type DuplexStream<TRequest, TResponse> = ReadableStream<TResponse> & WritableStream<TRequest>

// ============================================================================
// Flight Data Types (for transport layer)
// ============================================================================

/**
 * Raw FlightData message for transport
 */
export type RawFlightData = {
  flightDescriptor?: {
    type: number
    cmd?: Uint8Array
    path?: string[]
  }
  dataHeader?: Uint8Array
  dataBody?: Uint8Array
  appMetadata?: Uint8Array
}

/**
 * Raw FlightInfo response from transport
 */
export type RawFlightInfo = {
  schema?: Uint8Array
  flightDescriptor?: {
    type: number
    cmd?: Uint8Array
    path?: string[]
  }
  endpoint?: {
    ticket?: { ticket: Uint8Array }
    location?: { uri: string }[]
  }[]
  totalRecords?: string | number | bigint
  totalBytes?: string | number | bigint
}

/**
 * Raw ticket for DoGet
 */
export type RawTicket = {
  ticket: Uint8Array
}

/**
 * Raw action for DoAction
 */
export type RawAction = {
  type: string
  body?: Uint8Array
}

/**
 * Raw action result from DoAction
 */
export type RawActionResult = {
  body?: Uint8Array
}

/**
 * Raw action type from ListActions
 */
export type RawActionType = {
  type: string
  description?: string
}

/**
 * Raw handshake message
 */
export type RawHandshakeMessage = {
  protocolVersion?: string | number
  payload?: Uint8Array
}

/**
 * Raw put result
 */
export type RawPutResult = {
  appMetadata?: Uint8Array
}

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Abstract transport type for Flight SQL operations.
 *
 * Each runtime provides its own implementation:
 * - GrpcJsTransport for Node.js/Bun (using @grpc/grpc-js)
 * - GrpcWebTransport for Browser/Cloudflare Workers
 * - DenoTransport for Deno (native gRPC or gRPC-web)
 */
export type FlightTransport = {
  /**
   * Connect to the Flight SQL server
   */
  connect: () => Promise<void>

  /**
   * Close the connection
   */
  close: () => void

  /**
   * Check if connected
   */
  isConnected: () => boolean

  /**
   * Set authentication token for subsequent requests
   */
  setAuthToken: (token: string | null) => void

  // --------------------------------------------------------------------------
  // Unary Calls
  // --------------------------------------------------------------------------

  /**
   * GetFlightInfo - Get metadata about a flight
   */
  getFlightInfo: (
    descriptor: { type: number; cmd?: Uint8Array; path?: string[] },
    metadata?: TransportMetadata
  ) => Promise<RawFlightInfo>

  /**
   * GetSchema - Get schema for a flight descriptor
   */
  getSchema: (
    descriptor: { type: number; cmd?: Uint8Array; path?: string[] },
    metadata?: TransportMetadata
  ) => Promise<{ schema: Uint8Array }>

  // --------------------------------------------------------------------------
  // Server Streaming
  // --------------------------------------------------------------------------

  /**
   * DoGet - Retrieve data for a ticket
   */
  doGet: (ticket: RawTicket, metadata?: TransportMetadata) => ReadableStream<RawFlightData>

  /**
   * DoAction - Execute an action
   */
  doAction: (action: RawAction, metadata?: TransportMetadata) => ReadableStream<RawActionResult>

  /**
   * ListActions - List available actions
   */
  listActions: (metadata?: TransportMetadata) => ReadableStream<RawActionType>

  /**
   * ListFlights - List available flights
   */
  listFlights: (
    criteria?: Uint8Array,
    metadata?: TransportMetadata
  ) => ReadableStream<RawFlightInfo>

  // --------------------------------------------------------------------------
  // Bidirectional Streaming
  // --------------------------------------------------------------------------

  /**
   * DoPut - Upload data
   */
  doPut: (metadata?: TransportMetadata) => DuplexStream<RawFlightData, RawPutResult>

  /**
   * DoExchange - Bidirectional data exchange
   */
  doExchange: (metadata?: TransportMetadata) => DuplexStream<RawFlightData, RawFlightData>

  /**
   * Handshake - Authentication handshake
   */
  handshake: (
    metadata?: TransportMetadata
  ) => DuplexStream<RawHandshakeMessage, RawHandshakeMessage>
}

/**
 * Factory function type for creating transports
 */
export type TransportFactory = (options: TransportOptions) => FlightTransport

// ============================================================================
// Transport Registry
// ============================================================================

/**
 * Registered transport factories by runtime
 */
const transportRegistry = new Map<string, TransportFactory>()

/**
 * Register a transport factory for a runtime
 */
export function registerTransport(runtime: string, factory: TransportFactory): void {
  transportRegistry.set(runtime, factory)
}

/**
 * Get a registered transport factory
 */
export function getTransportFactory(runtime: string): TransportFactory | undefined {
  return transportRegistry.get(runtime)
}

/**
 * Get all registered runtime names
 */
export function getRegisteredRuntimes(): string[] {
  return Array.from(transportRegistry.keys())
}
