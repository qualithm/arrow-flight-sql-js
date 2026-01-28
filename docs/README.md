# Arrow Flight SQL JS Documentation

This directory contains the documentation site for Arrow Flight SQL JS.

## Development

Run these commands to set up a local environment:

```bash
cp env-example .env.development
bun i
bun start
```

To run ESLint or Prettier, use:

```bash
bun eslint:fix
bun prettier:format
```

## Deployment

Pushing to the `main` branch will trigger a deployment in production.
