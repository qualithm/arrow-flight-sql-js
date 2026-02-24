import { describe, expect, test } from "vitest"

import {
  FlightSqlError,
  validateHandle,
  validateParameterData,
  validateQuery,
  validateTransactionId
} from "../../errors.js"

describe("FlightSqlError", () => {
  test("creates error with SQL code", () => {
    const error = new FlightSqlError("test error", "INVALID_QUERY")

    expect(error.message).toBe("test error")
    expect(error.sqlCode).toBe("INVALID_QUERY")
    expect(error.code).toBe("INVALID_ARGUMENT")
    expect(error.name).toBe("FlightSqlError")
  })

  test("creates error with custom flight code", () => {
    const error = new FlightSqlError("test error", "TRANSACTION_ERROR", {
      flightCode: "FAILED_PRECONDITION"
    })

    expect(error.sqlCode).toBe("TRANSACTION_ERROR")
    expect(error.code).toBe("FAILED_PRECONDITION")
  })

  test("creates error with details", () => {
    const error = new FlightSqlError("test error", "INVALID_QUERY", {
      details: "additional details"
    })

    expect(error.details).toBe("additional details")
  })

  test("creates error with cause", () => {
    const cause = new Error("original error")
    const error = new FlightSqlError("wrapped error", "INVALID_QUERY", { cause })

    expect(error.cause).toBe(cause)
  })

  describe("type guards", () => {
    test("isFlightSqlError returns true for FlightSqlError", () => {
      const error = new FlightSqlError("test", "INVALID_QUERY")

      expect(FlightSqlError.isFlightSqlError(error)).toBe(true)
    })

    test("isFlightSqlError returns false for generic Error", () => {
      const error = new Error("test")

      expect(FlightSqlError.isFlightSqlError(error)).toBe(false)
    })

    test("isInvalidQuery returns true for INVALID_QUERY errors", () => {
      const error = new FlightSqlError("test", "INVALID_QUERY")

      expect(FlightSqlError.isInvalidQuery(error)).toBe(true)
      expect(FlightSqlError.isInvalidHandle(error)).toBe(false)
    })

    test("isInvalidHandle returns true for INVALID_HANDLE errors", () => {
      const error = new FlightSqlError("test", "INVALID_HANDLE")

      expect(FlightSqlError.isInvalidHandle(error)).toBe(true)
      expect(FlightSqlError.isInvalidQuery(error)).toBe(false)
    })

    test("isInvalidParameter returns true for INVALID_PARAMETER errors", () => {
      const error = new FlightSqlError("test", "INVALID_PARAMETER")

      expect(FlightSqlError.isInvalidParameter(error)).toBe(true)
    })

    test("isTransactionError returns true for TRANSACTION_ERROR errors", () => {
      const error = new FlightSqlError("test", "TRANSACTION_ERROR")

      expect(FlightSqlError.isTransactionError(error)).toBe(true)
    })

    test("isResultError returns true for RESULT_ERROR errors", () => {
      const error = new FlightSqlError("test", "RESULT_ERROR")

      expect(FlightSqlError.isResultError(error)).toBe(true)
    })
  })
})

describe("validateQuery", () => {
  test("accepts valid query string", () => {
    // Should not throw
    validateQuery("SELECT * FROM users")
  })

  test("accepts query with whitespace", () => {
    // Should not throw
    validateQuery("  SELECT * FROM users  ")
  })

  test("throws for empty string", () => {
    expect(() => {
      validateQuery("")
    }).toThrow(FlightSqlError)
    expect(() => {
      validateQuery("")
    }).toThrow("query cannot be empty")
  })

  test("throws for whitespace-only string", () => {
    expect(() => {
      validateQuery("   ")
    }).toThrow(FlightSqlError)
    expect(() => {
      validateQuery("   ")
    }).toThrow("query cannot be empty")
  })

  test("throws error with INVALID_QUERY code", () => {
    try {
      validateQuery("")
    } catch (error) {
      expect(FlightSqlError.isInvalidQuery(error)).toBe(true)
    }
  })
})

describe("validateHandle", () => {
  test("accepts valid handle", () => {
    const handle = Buffer.from([1, 2, 3, 4])
    // Should not throw
    validateHandle(handle)
  })

  test("throws for empty buffer", () => {
    const handle = Buffer.alloc(0)

    expect(() => {
      validateHandle(handle)
    }).toThrow(FlightSqlError)
    expect(() => {
      validateHandle(handle)
    }).toThrow("handle cannot be empty")
  })

  test("throws with custom name", () => {
    const handle = Buffer.alloc(0)

    expect(() => {
      validateHandle(handle, "prepared statement handle")
    }).toThrow("prepared statement handle cannot be empty")
  })

  test("throws error with INVALID_HANDLE code", () => {
    try {
      validateHandle(Buffer.alloc(0))
    } catch (error) {
      expect(FlightSqlError.isInvalidHandle(error)).toBe(true)
    }
  })
})

describe("validateTransactionId", () => {
  test("accepts valid transaction ID", () => {
    const txnId = Buffer.from([1, 2, 3, 4])
    // Should not throw
    validateTransactionId(txnId)
  })

  test("throws for empty buffer", () => {
    const txnId = Buffer.alloc(0)

    expect(() => {
      validateTransactionId(txnId)
    }).toThrow(FlightSqlError)
    expect(() => {
      validateTransactionId(txnId)
    }).toThrow("transaction ID cannot be empty")
  })

  test("throws error with TRANSACTION_ERROR code", () => {
    try {
      validateTransactionId(Buffer.alloc(0))
    } catch (error) {
      expect(FlightSqlError.isTransactionError(error)).toBe(true)
    }
  })
})

describe("validateParameterData", () => {
  test("accepts valid parameter data", () => {
    const params = {
      schema: new Uint8Array([1, 2, 3]),
      data: new Uint8Array([4, 5, 6])
    }
    // Should not throw
    validateParameterData(params)
  })

  test("throws for empty schema", () => {
    const params = {
      schema: new Uint8Array(0),
      data: new Uint8Array([4, 5, 6])
    }

    expect(() => {
      validateParameterData(params)
    }).toThrow(FlightSqlError)
    expect(() => {
      validateParameterData(params)
    }).toThrow("parameter schema is required")
  })

  test("throws for empty data", () => {
    const params = {
      schema: new Uint8Array([1, 2, 3]),
      data: new Uint8Array(0)
    }

    expect(() => {
      validateParameterData(params)
    }).toThrow(FlightSqlError)
    expect(() => {
      validateParameterData(params)
    }).toThrow("parameter data is required")
  })

  test("throws error with INVALID_PARAMETER code", () => {
    try {
      validateParameterData({ schema: new Uint8Array(0), data: new Uint8Array([1]) })
    } catch (error) {
      expect(FlightSqlError.isInvalidParameter(error)).toBe(true)
    }
  })
})
