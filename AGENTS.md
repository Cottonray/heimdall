# HEIMDALL contribution instructions

- HEIMDALL is an independent project. Keep organization-specific source, derived scenarios, infrastructure, credentials and operational records out of this repository and its history.
- Use synthetic examples and operator-supplied environment variables. Never embed customer endpoints or private deployment details.
- Keep Studio application code in TypeScript: React with shadcn/ui for the UI and Node.js for the server.
- Follow studio/DESIGN.md and shared UI components; keep API types in contracts/studio.ts.
- Keep domain logic independent of HTTP, databases and React. Preserve existing user data and authentication boundaries.
- Generated web/studio files must come from the source build.
- Do not run type checks, lint or test suites under the existing project verification policy. Build the UI and requested distributables; report verification limits.
- Do not deploy or change live data as part of documentation or history cleanup.
