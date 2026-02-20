# NPM Example

Production-ready template for NPM packages.

## Usage

1. Use this template to create a new repository
2. Update `name` in `package.json` to your package name
3. Update `CONTEXT.md` with your project's intent
4. Start building in `src/`

## Development

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 20+

### Setup

```bash
bun install
```

### Building

```bash
bun run build
```

### Running

```bash
bun run start
```

### Testing

```bash
bun test
```

### Linting & Formatting

```bash
bun run lint
bun run format
bun run typecheck
```

### Benchmarks

```bash
bun run bench
```

## Publishing

The package is automatically published to NPM when CI passes on main. Update the version in
`package.json` before merging to trigger a new release.
