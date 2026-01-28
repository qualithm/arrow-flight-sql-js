/**
 * Unit tests for error types and error handling
 */

import { describe, expect, test } from "bun:test"

import {
  AuthenticationError,
  CancelledError,
  ConnectionError,
  FlightSqlError,
  fromGrpcStatus,
  NotFoundError,
  ProtocolError,
  QueryError,
  TimeoutError
} from "../../errors"

describe("FlightSqlError", () => {
  test("should create error with message", () => {
    const error = new FlightSqlError("Test error")

    expect(error.message).toBe("Test error")
    expect(error.name).toBe("FlightSqlError")
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(FlightSqlError)
  })

  test("should include gRPC code", () => {
    const error = new FlightSqlError("Test error", { grpcCode: 14 })

    expect(error.grpcCode).toBe(14)
  })

  test("should include SQL state", () => {
    const error = new FlightSqlError("Test error", { sqlState: "42S02" })

    expect(error.sqlState).toBe("42S02")
  })

  test("should include cause", () => {
    const cause = new Error("Root cause")
    const error = new FlightSqlError("Test error", { cause })

    expect(error.cause).toBe(cause)
  })
})

describe("ConnectionError", () => {
  test("should create connection error", () => {
    const error = new ConnectionError("Connection refused")

    expect(error.message).toBe("Connection refused")
    expect(error.name).toBe("ConnectionError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(ConnectionError)
  })

  test("should include gRPC code", () => {
    const error = new ConnectionError("Unavailable", { grpcCode: 14 })

    expect(error.grpcCode).toBe(14)
  })
})

describe("AuthenticationError", () => {
  test("should create authentication error", () => {
    const error = new AuthenticationError("Invalid token")

    expect(error.message).toBe("Invalid token")
    expect(error.name).toBe("AuthenticationError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(AuthenticationError)
  })
})

describe("QueryError", () => {
  test("should create query error", () => {
    const error = new QueryError("Syntax error near SELECT")

    expect(error.message).toBe("Syntax error near SELECT")
    expect(error.name).toBe("QueryError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(QueryError)
  })

  test("should include SQL state", () => {
    const error = new QueryError("Table not found", { sqlState: "42S02" })

    expect(error.sqlState).toBe("42S02")
  })
})

describe("TimeoutError", () => {
  test("should create timeout error", () => {
    const error = new TimeoutError("Operation timed out")

    expect(error.message).toBe("Operation timed out")
    expect(error.name).toBe("TimeoutError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(TimeoutError)
  })

  test("should include timeout duration", () => {
    const error = new TimeoutError("Timed out", { timeoutMs: 30000 })

    expect(error.timeoutMs).toBe(30000)
  })
})

describe("ProtocolError", () => {
  test("should create protocol error", () => {
    const error = new ProtocolError("Invalid protobuf message")

    expect(error.message).toBe("Invalid protobuf message")
    expect(error.name).toBe("ProtocolError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(ProtocolError)
  })
})

describe("NotFoundError", () => {
  test("should create not found error", () => {
    const error = new NotFoundError("Table not found")

    expect(error.message).toBe("Table not found")
    expect(error.name).toBe("NotFoundError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(NotFoundError)
  })
})

describe("CancelledError", () => {
  test("should create cancelled error", () => {
    const error = new CancelledError("Query cancelled")

    expect(error.message).toBe("Query cancelled")
    expect(error.name).toBe("CancelledError")
    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error).toBeInstanceOf(CancelledError)
  })
})

describe("fromGrpcStatus", () => {
  test("should map OK to FlightSqlError", () => {
    const error = fromGrpcStatus(0, "OK")

    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error.grpcCode).toBe(0)
  })

  test("should map CANCELLED to CancelledError", () => {
    const error = fromGrpcStatus(1, "Cancelled")

    expect(error).toBeInstanceOf(CancelledError)
    expect(error.grpcCode).toBe(1)
  })

  test("should map DEADLINE_EXCEEDED to TimeoutError", () => {
    const error = fromGrpcStatus(4, "Deadline exceeded")

    expect(error).toBeInstanceOf(TimeoutError)
    expect(error.grpcCode).toBe(4)
  })

  test("should map NOT_FOUND to NotFoundError", () => {
    const error = fromGrpcStatus(5, "Not found")

    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.grpcCode).toBe(5)
  })

  test("should map PERMISSION_DENIED to AuthenticationError", () => {
    const error = fromGrpcStatus(7, "Permission denied")

    expect(error).toBeInstanceOf(AuthenticationError)
    expect(error.grpcCode).toBe(7)
  })

  test("should map UNAUTHENTICATED to AuthenticationError", () => {
    const error = fromGrpcStatus(16, "Unauthenticated")

    expect(error).toBeInstanceOf(AuthenticationError)
    expect(error.grpcCode).toBe(16)
  })

  test("should map UNAVAILABLE to ConnectionError", () => {
    const error = fromGrpcStatus(14, "Unavailable")

    expect(error).toBeInstanceOf(ConnectionError)
    expect(error.grpcCode).toBe(14)
  })

  test("should map INVALID_ARGUMENT to QueryError", () => {
    const error = fromGrpcStatus(3, "Invalid argument")

    expect(error).toBeInstanceOf(QueryError)
    expect(error.grpcCode).toBe(3)
  })

  test("should map FAILED_PRECONDITION to QueryError", () => {
    const error = fromGrpcStatus(9, "Failed precondition")

    expect(error).toBeInstanceOf(QueryError)
    expect(error.grpcCode).toBe(9)
  })

  test("should map INTERNAL to ProtocolError", () => {
    const error = fromGrpcStatus(13, "Internal error")

    expect(error).toBeInstanceOf(ProtocolError)
    expect(error.grpcCode).toBe(13)
  })

  test("should map DATA_LOSS to ProtocolError", () => {
    const error = fromGrpcStatus(15, "Data loss")

    expect(error).toBeInstanceOf(ProtocolError)
    expect(error.grpcCode).toBe(15)
  })

  test("should include cause error", () => {
    const cause = new Error("Original error")
    const error = fromGrpcStatus(14, "Unavailable", cause)

    expect(error.cause).toBe(cause)
  })

  test("should map unknown codes to FlightSqlError", () => {
    const error = fromGrpcStatus(99, "Unknown error")

    expect(error).toBeInstanceOf(FlightSqlError)
    expect(error.grpcCode).toBe(99)
  })
})
