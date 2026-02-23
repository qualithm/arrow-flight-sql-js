/**
 * Integration test configuration for Flight SQL.
 *
 * Configure the Arrow Flight SQL server connection via environment variables:
 * - FLIGHT_HOST: Host address (default: localhost)
 * - FLIGHT_PORT: Port number (default: 50051)
 * - FLIGHT_TLS: Enable TLS (default: false)
 */

export const config = {
  host: process.env.FLIGHT_HOST ?? "localhost",
  port: parseInt(process.env.FLIGHT_PORT ?? "50051", 10),
  tls: process.env.FLIGHT_TLS === "true",

  // Test credentials (configure for your Flight SQL server)
  credentials: {
    admin: { username: "admin", password: "admin123" },
    reader: { username: "reader", password: "reader123" },
    invalid: { username: "invalid", password: "wrong" }
  },

  // Test tables (Flight SQL exposes flights as tables)
  tables: {
    integers: "integers",
    strings: "strings",
    allTypes: "all-types",
    empty: "empty",
    large: "large",
    nested: "nested"
  },

  // Server-specific catalog name (configure for your Flight SQL server)
  catalog: process.env.FLIGHT_CATALOG ?? "default"
} as const

/**
 * Checks if the Arrow Flight SQL server is likely available.
 */
export function isServerConfigured(): boolean {
  return config.host !== "" && config.port > 0
}
