# Development and releases

## Local setup

```bash
npm ci
npm run check:typescript
npm run check
npm run check:tests
npm test
npm run build
```

Build the docs locally with:

```bash
uvx --with mkdocs-material mkdocs build --strict
uvx --with mkdocs-material mkdocs serve
```

Open `http://127.0.0.1:8000/` while editing.

## Repository layout

```text
src/index.ts       public package and backend ports
tests/             unit and SQLite integration tests
examples/          runnable generic example
docs/              MkDocs documentation
.github/workflows/ CI, release, and Pages publishing
```

## CI and documentation

Every push runs TypeScript 7 checks, tests, and a build. The documentation
workflow builds the MkDocs site with `--strict` and deploys it to GitHub Pages
without creating a documentation branch.

## npm release

1. Update the version in `package.json` and `package-lock.json`.
2. Run the local check set and inspect the generated `dist/` directory.
3. Create and push a version tag, then publish the matching GitHub Release.
4. The release workflow publishes through the npm trusted publisher.

The package does not need a long-lived npm token for releases.
