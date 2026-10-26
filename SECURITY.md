# Security

Please report vulnerabilities **privately** through [GitHub's private vulnerability reporting](https://github.com/t999-OP/kiln-learn/security/advisories/new) rather than in a public issue. Include steps to reproduce and the affected version. We'll acknowledge reports as soon as we can and coordinate a fix and disclosure with you.

Only the latest release receives security fixes.

## Design notes for operators

- Passwords are hashed with scrypt. Session cookies and agent tokens are random secrets; only their SHA-256 is stored.
- Users' AI API keys are encrypted with AES-256-GCM using `KILN_SECRET`. Keep it secret and backed up.
- Interactive widgets run on a separate origin with a strict Content-Security-Policy and no network access.
- The MCP endpoint only accepts bearer tokens, never browser cookies. Sessions are bound to the token's user.
- Custom AI server URLs (Ollama, self-hosted models) make the server send requests to arbitrary addresses. By default only admins may set them (`KILN_AI_CUSTOM_URLS`).
- Login, sign-up and AI calls are rate-limited per process. Run a single instance, or add a shared rate limiter in front if you scale out.
