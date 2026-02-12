/**
 * gRPC-Web Transport
 *
 * Transport implementation using the gRPC-web protocol for browser and
 * Cloudflare Workers environments. Uses the native Fetch API.
 *
 * Limitations:
 * - Client streaming (DoPut) and bidirectional streaming (DoExchange, Handshake)
 *   are not fully supported in gRPC-web. These methods will throw an error.
 * - Requires a gRPC-web proxy (e.g., Envoy, grpcwebproxy) in front of the
 *   Flight SQL server.
 *
 * @see https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-WEB.md
 */

import { Runtime } from "./runtime"
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
  type TransportError,
  type TransportMetadata,
  type TransportOptions
} from "./transport"

// gRPC-web content types
const GRPC_WEB_CONTENT_TYPE = "application/grpc-web+proto"
// const GRPC_WEB_TEXT_CONTENT_TYPE = "application/grpc-web-text+proto" // For base64 mode

// gRPC-web frame flags
const DATA_FRAME = 0x00
const TRAILER_FRAME = 0x80

// gRPC status codes
const GRPC_STATUS = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16
} as const

// Default values
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

// Flight service path
const FLIGHT_SERVICE_PATH = "/arrow.flight.protocol.FlightService"

// ============================================================================
// Protobuf Wire Format Helpers
// ============================================================================

/**
 * Encode a varint (variable-length integer)
 */
function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = []
  let v = value >>> 0

  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v)

  return new Uint8Array(bytes)
}

/**
 * Decode a varint from a buffer at a given offset
 * Returns [value, bytesRead]
 */
function decodeVarint(buffer: Uint8Array, offset: number): [number, number] {
  let result = 0
  let shift = 0
  let bytesRead = 0

  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead]
    result |= (byte & 0x7f) << shift

    bytesRead++
    if ((byte & 0x80) === 0) {
      break
    }
    shift += 7
  }

  return [result >>> 0, bytesRead]
}

/**
 * Encode a field tag
 */
function encodeTag(fieldNumber: number, wireType: number): Uint8Array {
  return encodeVarint((fieldNumber << 3) | wireType)
}

/**
 * Encode a string field
 */
function encodeStringField(fieldNumber: number, value: string): Uint8Array {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(value)
  return encodeBytesField(fieldNumber, bytes)
}

/**
 * Encode a bytes field
 */
function encodeBytesField(fieldNumber: number, value: Uint8Array): Uint8Array {
  const tag = encodeTag(fieldNumber, 2) // wire type 2 = length-delimited
  const length = encodeVarint(value.length)

  const result = new Uint8Array(tag.length + length.length + value.length)
  result.set(tag, 0)
  result.set(length, tag.length)
  result.set(value, tag.length + length.length)

  return result
}

/**
 * Encode a varint field
 */
function encodeVarintField(fieldNumber: number, value: number): Uint8Array {
  const tag = encodeTag(fieldNumber, 0) // wire type 0 = varint
  const varint = encodeVarint(value)

  const result = new Uint8Array(tag.length + varint.length)
  result.set(tag, 0)
  result.set(varint, tag.length)

  return result
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const filtered = arrays.filter((a) => a.length > 0)
  if (filtered.length === 0) {
    return new Uint8Array(0)
  }
  if (filtered.length === 1) {
    return filtered[0]
  }

  const totalLength = filtered.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)

  let offset = 0
  for (const arr of filtered) {
    result.set(arr, offset)
    offset += arr.length
  }

  return result
}

// ============================================================================
// Protobuf Message Encoders
// ============================================================================

/**
 * Encode a FlightDescriptor message
 */
function encodeFlightDescriptor(descriptor: {
  type: number
  cmd?: Uint8Array
  path?: string[]
}): Uint8Array {
  const parts: Uint8Array[] = []

  // field 1: type (enum as varint)
  parts.push(encodeVarintField(1, descriptor.type))

  // field 2: cmd (bytes)
  if (descriptor.cmd && descriptor.cmd.length > 0) {
    parts.push(encodeBytesField(2, descriptor.cmd))
  }

  // field 3: path (repeated string)
  if (descriptor.path) {
    for (const p of descriptor.path) {
      parts.push(encodeStringField(3, p))
    }
  }

  return concat(...parts)
}

/**
 * Encode a Ticket message
 */
function encodeTicket(ticket: RawTicket): Uint8Array {
  return encodeBytesField(1, ticket.ticket)
}

/**
 * Encode an Action message
 */
function encodeAction(action: RawAction): Uint8Array {
  const parts: Uint8Array[] = []

  // field 1: type (string)
  parts.push(encodeStringField(1, action.type))

  // field 2: body (bytes)
  if (action.body && action.body.length > 0) {
    parts.push(encodeBytesField(2, action.body))
  }

  return concat(...parts)
}

/**
 * Encode a Criteria message
 */
function encodeCriteria(expression?: Uint8Array): Uint8Array {
  if (!expression || expression.length === 0) {
    return new Uint8Array(0)
  }
  return encodeBytesField(1, expression)
}

// ============================================================================
// Protobuf Message Decoders
// ============================================================================

type ProtoField = {
  fieldNumber: number
  wireType: number
  data: Uint8Array | number
}

/**
 * Parse protobuf fields from a buffer
 */
function parseProtoFields(buffer: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0

  while (offset < buffer.length) {
    const [tag, tagBytes] = decodeVarint(buffer, offset)
    offset += tagBytes

    const fieldNumber = tag >>> 3
    const wireType = tag & 0x07

    if (wireType === 0) {
      // Varint
      const [value, valueBytes] = decodeVarint(buffer, offset)
      offset += valueBytes
      fields.push({ fieldNumber, wireType, data: value })
    } else if (wireType === 2) {
      // Length-delimited
      const [length, lengthBytes] = decodeVarint(buffer, offset)
      offset += lengthBytes
      const data = buffer.slice(offset, offset + length)
      offset += length
      fields.push({ fieldNumber, wireType, data })
    } else if (wireType === 1) {
      // 64-bit fixed
      const data = buffer.slice(offset, offset + 8)
      offset += 8
      fields.push({ fieldNumber, wireType, data })
    } else if (wireType === 5) {
      // 32-bit fixed
      const data = buffer.slice(offset, offset + 4)
      offset += 4
      fields.push({ fieldNumber, wireType, data })
    } else {
      // Unknown wire type, skip
      break
    }
  }

  return fields
}

/**
 * Get a bytes field value
 */
function getBytesField(fields: ProtoField[], fieldNumber: number): Uint8Array | undefined {
  const field = fields.find((f) => f.fieldNumber === fieldNumber && f.wireType === 2)
  return field?.data instanceof Uint8Array ? field.data : undefined
}

/**
 * Get a string field value
 */
function getStringField(fields: ProtoField[], fieldNumber: number): string | undefined {
  const bytes = getBytesField(fields, fieldNumber)
  if (!bytes) {
    return undefined
  }
  return new TextDecoder().decode(bytes)
}

/**
 * Get a varint field value
 */
function getVarintField(fields: ProtoField[], fieldNumber: number): number | undefined {
  const field = fields.find((f) => f.fieldNumber === fieldNumber && f.wireType === 0)
  return typeof field?.data === "number" ? field.data : undefined
}

/**
 * Get all repeated bytes fields
 */
function getRepeatedBytesField(fields: ProtoField[], fieldNumber: number): Uint8Array[] {
  return fields
    .filter(
      (f) => f.fieldNumber === fieldNumber && f.wireType === 2 && f.data instanceof Uint8Array
    )
    .map((f) => f.data as Uint8Array)
}

/**
 * Decode a FlightInfo message
 */
function decodeFlightInfo(buffer: Uint8Array): RawFlightInfo {
  const fields = parseProtoFields(buffer)

  const result: RawFlightInfo = {}

  // field 1: schema
  const schema = getBytesField(fields, 1)
  if (schema) {
    result.schema = schema
  }

  // field 2: flight_descriptor (nested message)
  const descriptorBytes = getBytesField(fields, 2)
  if (descriptorBytes) {
    const descFields = parseProtoFields(descriptorBytes)
    result.flightDescriptor = {
      type: getVarintField(descFields, 1) ?? 0,
      cmd: getBytesField(descFields, 2),
      path: getRepeatedBytesField(descFields, 3).map((b) => new TextDecoder().decode(b))
    }
  }

  // field 3: endpoint (repeated, nested message)
  const endpointMessages = getRepeatedBytesField(fields, 3)
  if (endpointMessages.length > 0) {
    result.endpoint = endpointMessages.map((epBytes) => {
      const epFields = parseProtoFields(epBytes)
      const ep: NonNullable<RawFlightInfo["endpoint"]>[number] = {}

      // field 1: ticket
      const ticketBytes = getBytesField(epFields, 1)
      if (ticketBytes) {
        const ticketFields = parseProtoFields(ticketBytes)
        const ticket = getBytesField(ticketFields, 1)
        if (ticket) {
          ep.ticket = { ticket }
        }
      }

      // field 2: location (repeated)
      const locationMessages = getRepeatedBytesField(epFields, 2)
      if (locationMessages.length > 0) {
        ep.location = locationMessages.map((locBytes) => {
          const locFields = parseProtoFields(locBytes)
          return { uri: getStringField(locFields, 1) ?? "" }
        })
      }

      return ep
    })
  }

  // field 4: total_records
  const totalRecords = getVarintField(fields, 4)
  if (totalRecords !== undefined) {
    result.totalRecords = totalRecords
  }

  // field 5: total_bytes
  const totalBytes = getVarintField(fields, 5)
  if (totalBytes !== undefined) {
    result.totalBytes = totalBytes
  }

  return result
}

/**
 * Decode a FlightData message
 */
function decodeFlightData(buffer: Uint8Array): RawFlightData {
  const fields = parseProtoFields(buffer)

  const result: RawFlightData = {}

  // field 1: flight_descriptor
  const descriptorBytes = getBytesField(fields, 1)
  if (descriptorBytes) {
    const descFields = parseProtoFields(descriptorBytes)
    result.flightDescriptor = {
      type: getVarintField(descFields, 1) ?? 0,
      cmd: getBytesField(descFields, 2),
      path: getRepeatedBytesField(descFields, 3).map((b) => new TextDecoder().decode(b))
    }
  }

  // field 2: data_header
  result.dataHeader = getBytesField(fields, 2)

  // field 1000: data_body
  result.dataBody = getBytesField(fields, 1000)

  // field 3: app_metadata
  result.appMetadata = getBytesField(fields, 3)

  return result
}

/**
 * Decode a Result message (from DoAction)
 */
function decodeActionResult(buffer: Uint8Array): RawActionResult {
  const fields = parseProtoFields(buffer)
  return {
    body: getBytesField(fields, 1)
  }
}

/**
 * Decode an ActionType message
 */
function decodeActionType(buffer: Uint8Array): RawActionType {
  const fields = parseProtoFields(buffer)
  return {
    type: getStringField(fields, 1) ?? "",
    description: getStringField(fields, 2)
  }
}

/**
 * Decode a SchemaResult message
 */
function decodeSchemaResult(buffer: Uint8Array): { schema: Uint8Array } {
  const fields = parseProtoFields(buffer)
  return {
    schema: getBytesField(fields, 1) ?? new Uint8Array(0)
  }
}

// ============================================================================
// gRPC-Web Framing
// ============================================================================

/**
 * Frame a message for gRPC-web (5-byte header + payload)
 */
function frameMessage(data: Uint8Array): ArrayBuffer {
  const { length } = data
  const frame = new Uint8Array(5 + length)

  // Byte 0: flags (0x00 = data frame)
  frame[0] = DATA_FRAME

  // Bytes 1-4: length (big-endian)
  frame[1] = (length >>> 24) & 0xff
  frame[2] = (length >>> 16) & 0xff
  frame[3] = (length >>> 8) & 0xff
  frame[4] = length & 0xff

  // Payload
  frame.set(data, 5)

  return frame.buffer
}

/**
 * Parse gRPC-web frames from response body
 */
async function* parseGrpcWebFrames(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<{ isTrailer: boolean; data: Uint8Array }> {
  let buffer = new Uint8Array(0)
  let streamDone = false

  while (!streamDone) {
    const { done, value } = await reader.read()

    if (value) {
      // Append new data to buffer
      const newBuffer = new Uint8Array(buffer.length + value.length)
      newBuffer.set(buffer, 0)
      newBuffer.set(value, buffer.length)
      buffer = newBuffer
    }

    // Parse complete frames
    while (buffer.length >= 5) {
      const flags = buffer[0]
      const length = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4]

      if (buffer.length < 5 + length) {
        // Not enough data for complete frame
        break
      }

      const frameData = buffer.slice(5, 5 + length)
      buffer = buffer.slice(5 + length)

      const isTrailer = (flags & TRAILER_FRAME) !== 0
      yield { isTrailer, data: frameData }
    }

    if (done) {
      streamDone = true
    }
  }
}

/**
 * Parse gRPC trailers from trailer frame
 */
function parseTrailers(data: Uint8Array): { status: number; message?: string } {
  const text = new TextDecoder().decode(data)
  const lines = text.split("\r\n")

  let status: number = GRPC_STATUS.UNKNOWN
  let message: string | undefined

  for (const line of lines) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) {
      continue
    }

    const key = line.slice(0, colonIndex).trim().toLowerCase()
    const value = line.slice(colonIndex + 1).trim()

    if (key === "grpc-status") {
      const parsed = parseInt(value, 10)
      if (!Number.isNaN(parsed)) {
        status = parsed
      }
    } else if (key === "grpc-message") {
      message = decodeURIComponent(value)
    }
  }

  return { status, message }
}

/**
 * Create a TransportError from gRPC status
 */
function createTransportError(status: number, message?: string): TransportError {
  const error = new Error(message ?? `gRPC error: status ${String(status)}`) as TransportError
  error.code = status
  error.details = message
  return error
}

// ============================================================================
// GrpcWebTransport
// ============================================================================

/**
 * Transport implementation using gRPC-web protocol.
 * Works with browsers and Cloudflare Workers.
 *
 * Requires a gRPC-web proxy in front of the Flight SQL server.
 */
export class GrpcWebTransport implements FlightTransport {
  private readonly options: Required<
    Pick<TransportOptions, "host" | "port" | "tls" | "connectTimeoutMs" | "requestTimeoutMs">
  > &
    TransportOptions

  private authToken: string | null = null
  private connected = false
  private readonly baseUrl: string

  constructor(options: TransportOptions) {
    this.options = {
      ...options,
      tls: options.tls,
      connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    }

    const protocol = this.options.tls ? "https" : "http"
    this.baseUrl = `${protocol}://${this.options.host}:${String(this.options.port)}`
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    // For gRPC-web, we don't establish a persistent connection
    // Just verify the server is reachable with a simple request
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
      }, this.options.connectTimeoutMs)

      // Send an empty OPTIONS request to check connectivity
      const response = await fetch(this.baseUrl, {
        method: "OPTIONS",
        signal: controller.signal
      }).catch(() => null)

      clearTimeout(timeoutId)

      // Even if OPTIONS fails (which is expected), if we got here
      // without aborting, the server is reachable
      this.connected = true

      // Check for CORS errors
      if (response === null) {
        // Connection was aborted or failed
        throw new Error(`Failed to connect to ${this.baseUrl}`)
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error(`Connection timeout after ${String(this.options.connectTimeoutMs)}ms`)
      }
      // Allow connection even if OPTIONS fails - the actual RPC calls will fail if needed
      this.connected = true
    }
  }

  close(): void {
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
    const requestData = encodeFlightDescriptor(descriptor)
    const responseData = await this.unaryCall(
      `${FLIGHT_SERVICE_PATH}/GetFlightInfo`,
      requestData,
      metadata
    )
    return decodeFlightInfo(responseData)
  }

  async getSchema(
    descriptor: { type: number; cmd?: Uint8Array; path?: string[] },
    metadata?: TransportMetadata
  ): Promise<{ schema: Uint8Array }> {
    const requestData = encodeFlightDescriptor(descriptor)
    const responseData = await this.unaryCall(
      `${FLIGHT_SERVICE_PATH}/GetSchema`,
      requestData,
      metadata
    )
    return decodeSchemaResult(responseData)
  }

  // --------------------------------------------------------------------------
  // Server Streaming
  // --------------------------------------------------------------------------

  doGet(ticket: RawTicket, metadata?: TransportMetadata): ReadableStream<RawFlightData> {
    const requestData = encodeTicket(ticket)
    return this.serverStreamingCall(
      `${FLIGHT_SERVICE_PATH}/DoGet`,
      requestData,
      decodeFlightData,
      metadata
    )
  }

  doAction(action: RawAction, metadata?: TransportMetadata): ReadableStream<RawActionResult> {
    const requestData = encodeAction(action)
    return this.serverStreamingCall(
      `${FLIGHT_SERVICE_PATH}/DoAction`,
      requestData,
      decodeActionResult,
      metadata
    )
  }

  listActions(metadata?: TransportMetadata): ReadableStream<RawActionType> {
    // Empty message for ListActions
    const requestData = new Uint8Array(0)
    return this.serverStreamingCall(
      `${FLIGHT_SERVICE_PATH}/ListActions`,
      requestData,
      decodeActionType,
      metadata
    )
  }

  listFlights(criteria?: Uint8Array, metadata?: TransportMetadata): ReadableStream<RawFlightInfo> {
    const requestData = encodeCriteria(criteria)
    return this.serverStreamingCall(
      `${FLIGHT_SERVICE_PATH}/ListFlights`,
      requestData,
      decodeFlightInfo,
      metadata
    )
  }

  // --------------------------------------------------------------------------
  // Bidirectional Streaming (Not Supported)
  // --------------------------------------------------------------------------

  doPut(_metadata?: TransportMetadata): DuplexStream<RawFlightData, RawPutResult> {
    throw new Error(
      "DoPut (client streaming) is not supported in gRPC-web. " +
        "Use a server-side runtime (Node.js/Bun) or a different protocol for uploads."
    )
  }

  doExchange(_metadata?: TransportMetadata): DuplexStream<RawFlightData, RawFlightData> {
    throw new Error(
      "DoExchange (bidirectional streaming) is not supported in gRPC-web. " +
        "Use a server-side runtime (Node.js/Bun) or WebSocket-based transport for bidirectional communication."
    )
  }

  handshake(_metadata?: TransportMetadata): DuplexStream<RawHandshakeMessage, RawHandshakeMessage> {
    throw new Error(
      "Handshake (bidirectional streaming) is not supported in gRPC-web. " +
        "Use bearer token authentication via setAuthToken() instead."
    )
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private createHeaders(metadata?: TransportMetadata): Headers {
    const headers = new Headers()

    headers.set("Content-Type", GRPC_WEB_CONTENT_TYPE)
    headers.set("Accept", GRPC_WEB_CONTENT_TYPE)
    headers.set("X-Grpc-Web", "1")
    headers.set("X-User-Agent", "grpc-web-js/0.1")

    // Add auth token
    if (this.authToken !== null && this.authToken !== "") {
      headers.set("Authorization", `Bearer ${this.authToken}`)
    }

    // Add custom metadata
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (Array.isArray(value)) {
          headers.set(key, value.join(", "))
        } else {
          headers.set(key, value)
        }
      }
    }

    return headers
  }

  private async unaryCall(
    path: string,
    requestData: Uint8Array,
    metadata?: TransportMetadata
  ): Promise<Uint8Array> {
    this.ensureConnected()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.options.requestTimeoutMs)

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.createHeaders(metadata),
        body: frameMessage(requestData),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw createTransportError(
          GRPC_STATUS.INTERNAL,
          `HTTP error: ${String(response.status)} ${response.statusText}`
        )
      }

      const reader = response.body?.getReader() as
        | ReadableStreamDefaultReader<Uint8Array>
        | undefined
      if (!reader) {
        throw createTransportError(GRPC_STATUS.INTERNAL, "No response body")
      }

      let responseData: Uint8Array | null = null
      let grpcStatus: { status: number; message?: string } | null = null

      for await (const frame of parseGrpcWebFrames(reader)) {
        if (frame.isTrailer) {
          grpcStatus = parseTrailers(frame.data)
        } else {
          responseData = frame.data
        }
      }

      // Check gRPC status
      if (grpcStatus && grpcStatus.status !== GRPC_STATUS.OK) {
        throw createTransportError(grpcStatus.status, grpcStatus.message)
      }

      if (!responseData) {
        throw createTransportError(GRPC_STATUS.INTERNAL, "No response data")
      }

      return responseData
    } catch (error) {
      clearTimeout(timeoutId)

      if ((error as Error).name === "AbortError") {
        throw createTransportError(GRPC_STATUS.DEADLINE_EXCEEDED, "Request timeout")
      }

      throw error
    }
  }

  private serverStreamingCall<T>(
    path: string,
    requestData: Uint8Array,
    decoder: (data: Uint8Array) => T,
    metadata?: TransportMetadata
  ): ReadableStream<T> {
    this.ensureConnected()

    // Use an object wrapper so closures can share mutable state
    const state = { cancelled: false }
    let controller: AbortController | null = null
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

    const asyncIterable: AsyncIterable<T> = {
      [Symbol.asyncIterator]: () => {
        return {
          next: async (): Promise<IteratorResult<T>> => {
            if (state.cancelled) {
              return { done: true, value: undefined }
            }

            // Initialize on first call
            if (!controller) {
              controller = new AbortController()

              const response = await fetch(`${this.baseUrl}${path}`, {
                method: "POST",
                headers: this.createHeaders(metadata),
                body: frameMessage(requestData),
                signal: controller.signal
              })

              if (!response.ok) {
                throw createTransportError(
                  GRPC_STATUS.INTERNAL,
                  `HTTP error: ${String(response.status)} ${response.statusText}`
                )
              }

              if (!response.body) {
                throw createTransportError(GRPC_STATUS.INTERNAL, "No response body")
              }

              reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>
            }

            // Read next frame
            if (!reader) {
              return { done: true, value: undefined }
            }

            // We need to maintain state across next() calls, so we use a
            // frame generator that we consume incrementally
            const frameIterator = parseGrpcWebFrames(reader)

            for await (const frame of frameIterator) {
              // This can be set by cancel() or return() from another async context
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (state.cancelled) {
                return { done: true, value: undefined }
              }

              if (frame.isTrailer) {
                const status = parseTrailers(frame.data)
                if (status.status !== GRPC_STATUS.OK) {
                  throw createTransportError(status.status, status.message)
                }
                return { done: true, value: undefined }
              }

              return { done: false, value: decoder(frame.data) }
            }

            return { done: true, value: undefined }
          },
          // eslint-disable-next-line @typescript-eslint/require-await
          return: async () => {
            state.cancelled = true
            controller?.abort()
            return { done: true as const, value: undefined }
          }
        }
      }
    }

    return {
      ...asyncIterable,
      [Symbol.asyncIterator]: asyncIterable[Symbol.asyncIterator],
      cancel: () => {
        state.cancelled = true
        controller?.abort()
      }
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("Transport not connected. Call connect() first.")
    }
  }
}

/**
 * Create a GrpcWebTransport instance
 */
export function createGrpcWebTransport(options: TransportOptions): FlightTransport {
  return new GrpcWebTransport(options)
}

// Register for browser and worker runtimes
registerTransport(Runtime.Browser, createGrpcWebTransport)

// Deno can also use gRPC-web since it has fetch support
registerTransport(Runtime.Deno, createGrpcWebTransport)

/**
 * Get the appropriate web transport for browser environments.
 *
 * @throws Error if called in a non-browser environment
 */
export function getWebTransport(options: TransportOptions): FlightTransport {
  return new GrpcWebTransport(options)
}
