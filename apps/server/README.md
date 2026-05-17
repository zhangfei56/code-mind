# Code Mind Web Server

Phase 5 exposes a lightweight Web UI through:

```bash
agent web start --cwd .
```

The server currently provides:

- `GET /api/sessions`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/diff`

And a minimal HTML page for browsing sessions.
