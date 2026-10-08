# Development and deployment

[Project overview](../README.md) · [Technical model](technical-model.md) ·
[Research guide](research.md)

This guide describes the checked-in development workflow and deployment boundaries
for the urban low-altitude drone corridor simulator. It does not certify an external
hosting configuration or a tested runtime-version matrix.

## Prerequisites and installation

- Git.
- Bun for installation using the committed `bun.lock` and `bunfig.toml`.
- Node.js compatible with the Vite/TanStack dependency versions in `package.json`.
- A WebGL-capable browser and network access to external runtime resources.

The repository does not currently pin Node.js or Bun versions or declare a runtime
compatibility matrix. Record the versions used for reproducible experiments and
validate them before publishing installation claims.

```sh
git clone https://github.com/nashyegi/hyperhex.git
cd hyperhex
bun install --frozen-lockfile
bun run dev
```

Use the URL printed by Vite rather than assuming a fixed port. The existing
configuration includes environment-dependent host and port behavior.

`--frozen-lockfile` is intended to prevent dependency resolution from silently
rewriting the lockfile. If installation fails, investigate the actual runtime,
registry, or lockfile error. Do not bypass the configured supply-chain release-age
policy to make an installation succeed. The repository's Bun configuration is the
source of truth for that policy.

Although the scripts are package-manager scripts, the repository does not include
an npm lockfile. An npm installation is not the documented lockfile-reproducible
workflow.

## Available scripts

These commands are defined in [`package.json`](../package.json):

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Vite development server |
| `bun run build` | Build through the configured TanStack Start/Nitro integration |
| `bun run build:dev` | Build in development mode |
| `bun run preview` | Invoke Vite's preview command; not a production deployment recipe |
| `bun run lint` | Run ESLint |
| `bun run test` | Run the Vitest suite |
| `bun run test:watch` | Run Vitest in watch mode |
| `bun run format` | Format the repository with Prettier; this modifies files |

For code changes, run lint, tests, and a production build in the intended environment.
Passing the current routing smoke tests does not validate simulation correctness.
For documentation-only changes, review links, command names, terminology, and the
diff without invoking repository-wide formatting that could change source files.

## Framework and source layout

The application uses React, TypeScript, TanStack Start/Router, Tailwind CSS, and Vite.
H3 provides geographic operations; CesiumJS is loaded by the workbench from a pinned
external release URL rather than from the package manifest.

The home route disables server-side rendering for the workbench. The repository
nevertheless includes a TanStack Start server entry and middleware. A client-rendered
route does not by itself make the complete deployment a static-only application.

Routing follows the existing [route conventions](../src/routes/README.md). The
[technical model](technical-model.md) describes the engine and UI boundaries.

## External resources and portability

| Resource | Current integration | Deployment consideration |
| --- | --- | --- |
| CesiumJS | Script and stylesheet loaded from the Cesium 1.121 release URL | Requires network availability unless the integration is changed; include it in dependency and attribution review even though it is not in `package.json`. |
| Map imagery | OpenStreetMap standard raster tiles | Preserve visible attribution and comply with tile-service usage rules. Do not assume unlimited service capacity or availability. |
| Fonts | Google Fonts stylesheet for JetBrains Mono and Space Grotesk | Remote requests remain part of the page's dependency and privacy assessment. |
| Displayed logo | Asset descriptor with a `/__l5e/assets-v1/...` URL | A descriptor is not a portable local image. Verify asset delivery on the intended host before claiming standalone deployment. |
| Build integration | `@lovable.dev/vite-tanstack-config` | Supplies framework/plugin configuration and a default deployment target. Removing it requires separate engineering work. |
| Error reporting | Optional browser hooks invoked by the root error boundary | Behavior depends on hooks supplied by the host/editor. Check the deployed page before making telemetry or privacy claims. |

The displayed-logo descriptor is
[`hyperhex-logo-v3.png.asset.json`](../src/assets/hyperhex-logo-v3.png.asset.json).
See [third-party components](../THIRD_PARTY_NOTICES.md) for the attribution inventory.

The engine does not contain a persistent research-data store or a live telemetry
feed. That does not imply that hosting providers and external resource providers
receive no request information. Assess actual deployed network behavior separately.

## Deployment boundaries

The current Vite configuration delegates to a platform integration whose documented
build default is Cloudflare through Nitro. There is no standalone deployment
runbook in the repository proving compatibility with a particular external host.

Before documenting an external deployment as supported:

1. Select a TanStack Start/Nitro-compatible target and verify the generated server
   and client artifacts for that target.
2. Validate the build and the actual production startup or deployment command.
3. Verify that platform-managed logo assets resolve, or arrange a portable asset
   delivery path with appropriate rights and attribution.
4. Exercise direct navigation, not-found behavior, and error handling.
5. Check Cesium initialization, fonts, map tiles, and visible attribution on desktop
   and mobile layouts.
6. Verify source/license links and that the offered source corresponds to the
   deployed covered version where required by the license.
7. Record environment requirements, external requests, and relevant provider terms.

Do not assume that uploading a static output directory or running the development
server is a production deployment. No provider credentials or infrastructure
configuration are provisioned by these instructions.

## Development provenance

The project was initially developed with AI-assisted tooling through Lovable and
retains its Git/build integration. This is development provenance, not HyperHex's
product identity or a claim of endorsement. The existing
[repository guidance](../AGENTS.md) warns against rewriting published history while
that integration is connected.

Branding changes to documentation do not remove build dependencies, managed assets,
or host-provided behavior. Any migration away from those integrations should be a
separate, tested code/configuration change.
