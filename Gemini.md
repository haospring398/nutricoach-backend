# Project Context: NutriCoach Backend

**Description:** REST API for the NutriCoach mobile app (Vietnamese nutrition + fitness coaching).
**Tech Stack:** Node.js (≥18), Express 4, TypeScript 5.9, PostgreSQL (Drizzle ORM), Redis (ioredis), JWT, Zod.

## Current Goal
Integrate Swagger (OpenAPI 3.0) documentation into the Express application using `swagger-jsdoc` and `swagger-ui-express`.

## Tasks Completed by Gemini
1. **Security Scan:** Scanned `swagger-jsdoc` and `swagger-ui-express` for vulnerabilities using the SecureCoder extension.
2. **Dependency Installation:** Installed `swagger-jsdoc`, `swagger-ui-express`, `@types/swagger-jsdoc`, and `@types/swagger-ui-express`.
3. **Swagger Configuration (`src/config/swagger.ts`):** 
   - Created the OpenAPI configuration object.
   - Defined the `BearerAuth` security scheme.
   - Manually translated all Zod schemas from the `src/validations/` folder into OpenAPI component schemas.
   - Added metadata and tags for all modules (Auth, Users, Nutrition, PT, etc.).
4. **App Integration (`src/app.ts`):**
   - Imported and mounted `swagger-ui-express` at the `/api-docs` endpoint.
   - Exposed the raw OpenAPI JSON at `/api-docs.json`.
   - Added an example `@openapi` annotation to the `/health` endpoint.
5. **Route Annotations:**
   - Added `@openapi` JSDoc annotations (tags, summaries, descriptions, request bodies, and responses) to the following route files:
     - `src/routes/auth.routes.ts`
     - `src/routes/users.routes.ts`
     - `src/routes/nutrition.routes.ts`
     - `src/routes/foods.routes.ts`
     - `src/routes/dashboard.routes.ts`
     - `src/routes/payment.routes.ts`
     - `src/routes/workout.routes.ts`
     - `src/routes/pt.routes.ts`

## Tasks Not Yet Completed (TODO)
The following tasks are left to be completed:

1. **Complete Route Annotations:**
   - Add `@openapi` JSDoc annotations to the remaining route files:
     - `src/routes/admin.routes.ts`
     - `src/routes/content.routes.ts`
2. **Verification & Testing:**
   - Run the development server (`npm run dev`).
   - Navigate to `http://localhost:<PORT>/api-docs` (default is usually port 3000) to ensure the Swagger UI renders correctly.
   - Verify that all endpoints and schemas appear correctly in the UI.
   - Fix any potential YAML parsing errors or schema reference errors that might surface when `swagger-jsdoc` parses the comments.

## Notes for Claude Code
- The project heavily uses Zod for validation, and the OpenAPI schemas defined in `src/config/swagger.ts` were designed to mirror those Zod validations.
- Route handlers are authenticated via the `authenticate` middleware, which expects a Bearer token. The Swagger configuration already includes the `BearerAuth` security scheme globally.
- Check `docs/API_CURRENT.md` if you need to cross-reference the original API specifications.
