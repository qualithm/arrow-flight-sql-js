/**
 * gRPC-JS Transport
 *
 * Transport implementation using @grpc/grpc-js for Node.js and Bun runtimes.
 */

import * as grpc from "@grpc/grpc-js"

import { getFlightServiceDefinition } from "./generated"
import { detectRuntime, Runtime, type RuntimeType } from "./runtime"
import {
  type DuplexStream,
  type FlightTransport,
  type RawAction,
  type RawActionResult,
  type RawActionType,
  type RawFlightData,
  type RawFlightInfo,
  type RawHandshakeMessage,
  type RawPutResult,
  type RawTicket,
  type ReadableStream,
  registerTransport,
  type TransportMetadata,
  type TransportOptions
} from "./transport"

// Default values
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

/**
 * Wrap a gRPC readable stream as an async iterable
 */
async function* wrapReadableStream<T>(stream: grpc.ClientReadableStream<T>): AsyncGenerator<T> {
  const errorHolder: { error: Error | null } = { error: null }

  stream.on("error", (err: Error) => {
    errorHolder.error = err
  })

  for await (const item of stream as AsyncIterable<T>) {
    const err = errorHolder.error
    if (err !== null) {
      throw err
    }
    yield item
  }

  // Check for error after stream ends
  const finalErr = errorHolder.error
  if (finalErr !== null) {
    throw finalErr
  }
}

/**
 * Create a ReadableStream wrapper around a gRPC ClientReadableStream
 */
function createReadableStream<T>(stream: grpc.ClientReadableStream<T>): ReadableStream<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return wrapReadableStream(stream)
    },
    cancel(): void {
      stream.cancel()
    }
  }
}

/**
 * Create a DuplexStream wrapper around a gRPC ClientDuplexStream
 */
function createDuplexStream<TReq, TRes>(
  stream: grpc.ClientDuplexStream<TReq, TRes>
): DuplexStream<TReq, TRes> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<TRes> {
      return wrapReadableStream(stream)
    },
    cancel(): void {
      stream.cancel()
    },
    write(message: TReq): boolean {
      return stream.write(message)
    },
    end(): void {
      stream.end()
    }
  }
}

/**
 * Transport implementation using @grpc/grpc-js.
 * Works with Node.js and Bun runtimes.
 */
export class GrpcJsTransport implements FlightTransport {
  private readonly options: Required<
    Pick<TransportOptions, "host" | "port" | "tls" | "connectTimeoutMs" | "requestTimeoutMs">
  > &
    TransportOptions

  private grpcClient: grpc.Client | null = null
  private flightService: grpc.ServiceClientConstructor | null = null
  private authToken: string | null = null
  private connected = false

  constructor(options: TransportOptions) {
    this.options = {
      ...options,
      tls: options.tls,
      connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    }
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    // Load the Flight service definition
    const packageDef = await getFlightServiceDefinition()

    // Navigate to arrow.flight.protocol.FlightService
    const arrowPackage = packageDef.arrow as grpc.GrpcObject
    const flightPackage = arrowPackage.flight as grpc.GrpcObject
    const protocolPackage = flightPackage.protocol as grpc.GrpcObject
    this.flightService = protocolPackage.FlightService as grpc.ServiceClientConstructor

    // Create channel credentials
    const credentials = this.createCredentials()

    // Create the gRPC client
    const address = `${this.options.host}:${String(this.options.port)}`
    this.grpcClient = new this.flightService(address, credentials, {
      "grpc.max_receive_message_length": -1, // Unlimited
      "grpc.max_send_message_length": -1,
      "grpc.keepalive_time_ms": 30_000,
      "grpc.keepalive_timeout_ms": 10_000
    })

    // Wait for channel to be ready
    await this.waitForReady()

    this.connected = true
  }

  close(): void {
    if (this.grpcClient) {
      this.grpcClient.close()
      this.grpcClient = null
    }
    this.flightService = null
    this.connected = false
    this.authToken = null
  }

  isConnected(): boolean {
    return this.connected
  }

  setAuthToken(token: string | null): void {
    this.authToken = token
  }

  // --------------------------------------------------------------------------
  // Unary Calls
  // --------------------------------------------------------------------------

  async getFlightInfo(
    descriptor: { type: number; cmd?: Uint8Array; path?: string[] },
    metadata?: TransportMetadata
  ): Promise<RawFlightInfo> {
    this.ensureConnected()

    return new Promise((resolve, reject) => {
      const client = this.grpcClient as grpc.Client & {
        getFlightInfo: (
          request: unknown,
          metadata: grpc.Metadata,
          callback: (error: grpc.ServiceError | null, response: unknown) => void
        ) => void
      }

      const grpcMeta = this.createRequestMetadata(metadata)
      const request = this.serializeDescriptor(descriptor)

      client.getFlightInfo(request, grpcMeta, (error, response) => {
        if (error) {
          reject(error)
          return
        }
        resolve(response as RawFlightInfo)
      })
    })
  }

  async getSchema(
    descriptor: { type: number; cmd?: Uint8Array; path?: string[] },
    metadata?: TransportMetadata
  ): Promise<{ schema: Uint8Array }> {
    this.ensureConnected()

    return new Promise((resolve, reject) => {
      const client = this.grpcClient as grpc.Client & {
        getSchema: (
          request: unknown,
          metadata: grpc.Metadata,
          callback: (error: grpc.ServiceError | null, response: unknown) => void
        ) => void
      }

      const grpcMeta = this.createRequestMetadata(metadata)
      const request = this.serializeDescriptor(descriptor)

      client.getSchema(request, grpcMeta, (error, response) => {
        if (error) {
          reject(error)
          return
        }
        resolve(response as { schema: Uint8Array })
      })
    })
  }

  // --------------------------------------------------------------------------
  // Server Streaming
  // --------------------------------------------------------------------------

  doGet(ticket: RawTicket, metadata?: TransportMetadata): ReadableStream<RawFlightData> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doGet: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.doGet({ ticket: ticket.ticket }, grpcMeta)

    return createReadableStream(stream as grpc.ClientReadableStream<RawFlightData>)
  }

  doAction(action: RawAction, metadata?: TransportMetadata): ReadableStream<RawActionResult> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doAction: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.doAction(action, grpcMeta)

    return createReadableStream(stream as grpc.ClientReadableStream<RawActionResult>)
  }

  listActions(metadata?: TransportMetadata): ReadableStream<RawActionType> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      listActions: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.listActions({}, grpcMeta)

    return createReadableStream(stream as grpc.ClientReadableStream<RawActionType>)
  }

  listFlights(criteria?: Uint8Array, metadata?: TransportMetadata): ReadableStream<RawFlightInfo> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      listFlights: (request: unknown, metadata: grpc.Metadata) => grpc.ClientReadableStream<unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.listFlights({ expression: criteria }, grpcMeta)

    return createReadableStream(stream as grpc.ClientReadableStream<RawFlightInfo>)
  }

  // --------------------------------------------------------------------------
  // Bidirectional Streaming
  // --------------------------------------------------------------------------

  doPut(metadata?: TransportMetadata): DuplexStream<RawFlightData, RawPutResult> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doPut: (metadata: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.doPut(grpcMeta)

    return createDuplexStream(stream as grpc.ClientDuplexStream<RawFlightData, RawPutResult>)
  }

  doExchange(metadata?: TransportMetadata): DuplexStream<RawFlightData, RawFlightData> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      doExchange: (metadata: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.doExchange(grpcMeta)

    return createDuplexStream(stream as grpc.ClientDuplexStream<RawFlightData, RawFlightData>)
  }

  handshake(metadata?: TransportMetadata): DuplexStream<RawHandshakeMessage, RawHandshakeMessage> {
    this.ensureConnected()

    const client = this.grpcClient as grpc.Client & {
      handshake: (metadata: grpc.Metadata) => grpc.ClientDuplexStream<unknown, unknown>
    }

    const grpcMeta = this.createRequestMetadata(metadata)
    const stream = client.handshake(grpcMeta)

    return createDuplexStream(
      stream as grpc.ClientDuplexStream<RawHandshakeMessage, RawHandshakeMessage>
    )
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private createCredentials(): grpc.ChannelCredentials {
    if (this.options.credentials !== undefined) {
      return this.options.credentials as grpc.ChannelCredentials
    }
    if (this.options.tls) {
      return grpc.credentials.createSsl()
    }
    return grpc.credentials.createInsecure()
  }

  private async waitForReady(): Promise<void> {
    const client = this.grpcClient
    if (!client) {
      throw new Error("gRPC client not initialized")
    }
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + this.options.connectTimeoutMs
      client.waitForReady(deadline, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  private ensureConnected(): void {
    if (!this.connected || !this.grpcClient) {
      throw new Error("Transport not connected. Call connect() first.")
    }
  }

  private createRequestMetadata(additional?: TransportMetadata): grpc.Metadata {
    const meta = new grpc.Metadata()

    // Add auth token if present
    if (this.authToken !== null && this.authToken !== "") {
      meta.set("authorization", `Bearer ${this.authToken}`)
    }

    // Add additional metadata
    if (additional) {
      for (const [key, value] of Object.entries(additional)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            meta.add(key, v)
          }
        } else {
          meta.set(key, value)
        }
      }
    }

    return meta
  }

  private serializeDescriptor(descriptor: {
    type: number
    cmd?: Uint8Array
    path?: string[]
  }): unknown {
    return {
      type: descriptor.type,
      cmd: descriptor.cmd,
      path: descriptor.path
    }
  }
}

/**
 * Create a GrpcJsTransport instance
 */
export function createGrpcJsTransport(options: TransportOptions): FlightTransport {
  return new GrpcJsTransport(options)
}

// Register for Node.js and Bun runtimes
registerTransport(Runtime.Node, createGrpcJsTransport)
registerTransport(Runtime.Bun, createGrpcJsTransport)

/**
 * Get the appropriate transport for the current runtime.
 * Returns the GrpcJsTransport for Node.js and Bun.
 *
 * @throws Error if no transport is available for the current runtime
 */
export function getTransportForRuntime(options: TransportOptions): FlightTransport {
  const info = detectRuntime()

  // Check for supported runtimes
  const supportedRuntimes: RuntimeType[] = [Runtime.Node, Runtime.Bun]
  if (supportedRuntimes.includes(info.runtime)) {
    return new GrpcJsTransport(options)
  }

  throw new Error(
    `No transport available for runtime: ${info.runtime}. ` +
      `Supported runtimes: ${supportedRuntimes.join(", ")}`
  )
}
