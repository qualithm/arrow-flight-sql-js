/**
 * Error handling example.
 *
 * Demonstrates handling various error types from Flight SQL operations.
 *
 * @example
 * ```bash
 * bun run examples/error-handling.ts
 * ```
 */
import { createFlightSqlClient, FlightError, FlightSqlError } from "../src/index.js"

async function main(): Promise<void> {
  const client = await createFlightSqlClient({
    host: "localhost",
    port: 8815,
    tls: false
  })

  console.log("Connected to Flight SQL server\n")

  try {
    // Example 1: Invalid query (empty string)
    console.log("--- Example 1: Empty Query ---")
    try {
      await client.query("")
    } catch (error) {
      handleError(error)
    }

    // Example 2: Invalid handle
    console.log("\n--- Example 2: Invalid Handle ---")
    try {
      await client.closePreparedStatement(Buffer.alloc(0))
    } catch (error) {
      handleError(error)
    }

    // Example 3: Invalid transaction ID
    console.log("\n--- Example 3: Invalid Transaction ID ---")
    try {
      await client.commit(Buffer.alloc(0))
    } catch (error) {
      handleError(error)
    }

    // Example 4: Invalid parameter data
    console.log("\n--- Example 4: Invalid Parameter Data ---")
    try {
      const prepared = await client.createPreparedStatement("SELECT 1")
      await client.bindParameters(prepared.handle, {
        schema: new Uint8Array(0),
        data: new Uint8Array([1, 2, 3])
      })
    } catch (error) {
      handleError(error)
    }

    // Example 5: Server error (simulated)
    console.log("\n--- Example 5: Server Error Handling ---")
    try {
      // This might fail with various server errors
      await client.query("SELECT * FROM nonexistent_table_xyz")
    } catch (error) {
      handleError(error)
    }
  } finally {
    client.close()
    console.log("\nConnection closed")
  }
}

function handleError(error: unknown): void {
  console.log("  Caught error:")

  // Check for Flight SQL specific errors first
  if (FlightSqlError.isFlightSqlError(error)) {
    console.log("    Type: FlightSqlError")
    console.log("    SQL Code:", error.sqlCode)
    console.log("    Flight Code:", error.code)
    console.log("    Message:", error.message)

    // Handle specific SQL error types
    if (FlightSqlError.isInvalidQuery(error)) {
      console.log("    Action: Check query syntax")
    } else if (FlightSqlError.isInvalidHandle(error)) {
      console.log("    Action: Verify handle is valid and not closed")
    } else if (FlightSqlError.isInvalidParameter(error)) {
      console.log("    Action: Check parameter schema and data")
    } else if (FlightSqlError.isTransactionError(error)) {
      console.log("    Action: Check transaction state")
    } else if (FlightSqlError.isResultError(error)) {
      console.log("    Action: Server returned unexpected result")
    }
    return
  }

  // Check for base Flight errors
  if (FlightError.isFlightError(error)) {
    console.log("    Type: FlightError")
    console.log("    Code:", error.code)
    console.log("    Message:", error.message)

    if (FlightError.isNotFound(error)) {
      console.log("    Action: Resource does not exist")
    } else if (FlightError.isUnauthenticated(error)) {
      console.log("    Action: Provide valid credentials")
    } else if (FlightError.isPermissionDenied(error)) {
      console.log("    Action: Request access to resource")
    } else if (FlightError.isInvalidArgument(error)) {
      console.log("    Action: Check input parameters")
    } else if (FlightError.isUnavailable(error)) {
      console.log("    Action: Server temporarily unavailable, retry later")
    } else if (FlightError.isDeadlineExceeded(error)) {
      console.log("    Action: Operation timed out, consider increasing timeout")
    }
    return
  }

  // Generic error
  if (error instanceof Error) {
    console.log("    Type: Error")
    console.log("    Message:", error.message)
  } else {
    console.log("    Unknown error:", error)
  }
}

main().catch(console.error)
