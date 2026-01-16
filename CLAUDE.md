# CLAUDE.md - Stack Profile & Competencies

## Tech Stack Overview

This project uses a modern, edge-first full-stack JavaScript architecture:
- **Runtime**: Bun (JavaScript runtime)
- **Language**: JavaScript/TypeScript
- **Frontend**: React with Tailwind CSS
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Cache/KV**: Cloudflare KV Store
- **Storage**: Cloudflare R2 (S3-compatible)
- **Auth**: Auth0

---

## Core Skills Required

### 1. JavaScript/TypeScript Mastery
- **ES2020+ syntax** (arrow functions, destructuring, spread operators, async/await)
- **Type safety** with TypeScript (interfaces, generics, utility types)
- **Functional programming** patterns (pure functions, immutability, composition)
- **Promise and async patterns** (critical for serverless/edge contexts)
- **Module systems** (ESM imports/exports)
- **JSON handling** and data serialization
- **Error handling** and validation strategies

### 2. Bun Runtime Expertise
- **Bun fundamentals**: Package manager, runtime, bundler, test runner
- **Bun-specific APIs**: File I/O, process management, child_process
- **Performance optimization**: Leverage Bun's speed advantages
- **Built-in tools**: No need for separate bundlers/transpilers in many cases
- **Package management**: `.bunfig.toml` configuration
- **Compatibility**: Understanding Bun's Node.js compatibility layer

### 3. React Development
- **Component architecture**: Functional components, hooks, composition
- **State management**: useState, useContext, useReducer, custom hooks
- **Effects & side effects**: useEffect, dependency arrays, cleanup
- **Performance**: Memoization (React.memo, useMemo, useCallback)
- **Forms**: Controlled inputs, validation, error handling
- **Routing**: Navigation patterns for SPA architecture
- **Testing**: Component testing, mocking, test organization

### 4. Tailwind CSS Proficiency
- **Utility-first approach**: Building layouts and designs with utility classes
- **Responsive design**: Mobile-first, breakpoints (sm, md, lg, xl, 2xl)
- **Customization**: Extending Tailwind config for project-specific needs
- **Component patterns**: Reusable component patterns with Tailwind
- **Performance**: Tree-shaking unused styles, purging CSS
- **Dark mode**: Implementation and theming strategies
- **Accessibility**: ARIA attributes and semantic HTML with Tailwind

### 5. Cloudflare Workers
- **Worker fundamentals**: Request/response handling, middleware pattern
- **FetchEvent API**: Handle, waitUntil, passThroughOnException
- **Module/Service Worker syntax**: Modern module-based workers
- **URL routing**: Pathpattern parsing, route matching
- **Environment variables**: env bindings, secrets management
- **CORS handling**: Cross-origin requests, preflight responses
- **Streaming responses**: Handling large data efficiently
- **Error handling**: Worker-specific error patterns

### 6. Cloudflare D1 (SQLite Database)
- **SQL fundamentals**: SELECT, INSERT, UPDATE, DELETE, JOINs, transactions
- **Schema design**: Tables, indexes, foreign keys, constraints
- **D1-specific bindings**: Database binding in worker_env
- **Prepared statements**: Parameter binding to prevent SQL injection
- **Query optimization**: Index strategies, query planning
- **Migrations**: Managing schema changes safely
- **Relationships**: One-to-many, many-to-many patterns
- **Data validation**: Type safety for database operations

### 7. Cloudflare KV Store
- **KV fundamentals**: Distributed key-value store, global namespace
- **CRUD operations**: Put, get, delete, list operations
- **TTL management**: Expiration strategies for cache invalidation
- **Metadata**: Storing metadata with KV entries
- **Namespacing**: Using KV namespaces for organization
- **Performance patterns**: Cache-first, stale-while-revalidate strategies
- **Size limits**: Understanding 25MB value limits and chunking strategies
- **Consistency**: Understanding eventual consistency model

### 8. Cloudflare R2 (Object Storage)
- **S3-compatible API**: Bucket operations, object management
- **R2 bindings**: Using R2 with Workers
- **Upload strategies**: Single upload, multipart upload, presigned URLs
- **Object metadata**: Custom headers, content types, CORS
- **Signed URLs**: Time-limited access tokens for public/private files
- **Performance**: Optimize uploads/downloads, compression
- **Cost optimization**: Understanding pricing model and usage patterns
- **Access control**: Public/private bucket policies

### 9. Auth0 Integration
- **OAuth 2.0 flow**: Authorization code flow, implicit flow
- **OpenID Connect**: ID tokens, user info endpoints
- **Auth0 SDK/libraries**: Integration in React and Workers
- **User management**: User profile, metadata, roles/permissions
- **Tokens**: Access tokens, refresh tokens, JWT decoding/verification
- **Rules & hooks**: Custom authentication logic
- **Logout & session management**: Revocation, session cleanup
- **Security**: PKCE, CORS, token storage best practices
- **Scopes & permissions**: Requesting user data, API permissions

---

## Essential Traits & Mindset

### 1. Edge-First Thinking
- Understand distributed execution and latency optimization
- Think about geographic distribution and performance
- Minimize cold starts and optimize initialization
- Design for stateless, scalable architecture
- Consider edge caching and request routing

### 2. Security-Conscious Developer
- **No hardcoded secrets**: Use environment variables and Auth0 tokens
- **Input validation**: Sanitize all user input, SQL injection prevention
- **CORS & CSRF**: Understand and implement properly
- **Token security**: JWT verification, expiration handling
- **HTTPS-only**: Enforce secure communication
- **Principle of least privilege**: Minimal permissions for each component

### 3. Performance Optimized
- **Minimize bundles**: Tree-shake unused code, lazy loading
- **Database queries**: Avoid N+1 queries, optimize joins
- **Cache strategies**: Leverage KV for frequently accessed data
- **Streaming responses**: Handle large payloads efficiently
- **Compression**: GZIP/Brotli for responses
- **Metrics awareness**: Monitor latency, bandwidth, worker usage

### 4. Type-Safe Development
- **TypeScript everywhere**: Frontend, backend, shared types
- **Strict mode**: Enable strict type checking
- **End-to-end typing**: Type definitions flow through entire stack
- **Type inference**: Leverage TS compiler for better DX
- **Validation**: Runtime validation against types (zod, valibot)

### 5. Testing & Quality
- **Unit tests**: Jest, Vitest for isolated function testing
- **Integration tests**: Test Workers with actual D1/KV/R2
- **End-to-end tests**: Test full auth flow, API endpoints
- **Error scenarios**: Test failure paths, edge cases
- **Type safety over mocks**: Prefer proper typing to extensive mocking
- **CI/CD integration**: Automated testing in pipeline

### 6. API Design Excellence
- **RESTful principles**: Proper HTTP methods, status codes
- **Error responses**: Consistent error format and messages
- **Versioning**: API version strategy
- **Documentation**: Clear endpoint documentation
- **Pagination**: Handling large result sets efficiently
- **Rate limiting**: Prevent abuse, implement gracefully

### 7. Adaptive & Learning-Oriented
- **Stay current**: Monitor Bun, Cloudflare, React updates
- **Experiment**: Try new patterns, tools, and optimizations
- **Documentation focus**: Read official docs, understand limitations
- **Community engagement**: Follow discussions, learn from others
- **Problem-solving**: Debug methodically, use DevTools effectively

### 8. Full-Stack Perspective
- **Frontend-backend collaboration**: Understand both needs and constraints
- **Database-aware frontend**: Know query implications of UI decisions
- **DevOps mindset**: Understand deployment, monitoring, scaling
- **Cost awareness**: Optimize for Cloudflare pricing model
- **User-centric**: Performance, accessibility, UX matter

---

## Development Workflow

### Local Development
- Use Bun for fast development and testing
- Run Workers locally with Wrangler
- Mock Auth0 in development (or use Auth0 development tenant)
- Use Vitest for test-driven development

### Database Development
- Create D1 migrations for schema changes
- Test queries locally before deployment
- Use transactions for data consistency
- Implement proper indexes for performance

### Deployment Strategy
- CI/CD pipeline with automated tests
- Staging environment for auth flow testing
- Environment-specific secrets management
- Rollback capability for failed deployments

---

## Performance Targets

- **First Contentful Paint**: < 2s
- **Worker response time**: < 100ms (p95)
- **Database queries**: < 50ms per query
- **Cold start**: < 1s
- **Lighthouse score**: 90+
- **Bundle size**: < 200KB (gzipped)

---

## Resources & References

- [Bun Documentation](https://bun.sh/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 SQLite Guide](https://developers.cloudflare.com/d1/)
- [KV Store Reference](https://developers.cloudflare.com/kv/)
- [R2 Object Storage](https://developers.cloudflare.com/r2/)
- [Auth0 Integration Guides](https://auth0.com/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
