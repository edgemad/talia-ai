// Express 4 does not catch throws from async handlers — a stray fs/spawn/
// network error would become an unhandled rejection and (in Node ≥ 15) kill
// the whole sidecar process. harden() wraps every route registration so
// failures answer as JSON (or an SSE error event) instead of crashing.
export function harden(router) {
  for (const method of ["get", "post", "put", "delete", "patch", "all"]) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) =>
      original(
        path,
        ...handlers.map((h) => {
          if (typeof h !== "function") return h;
          return async (req, res, next) => {
            try {
              await h(req, res, next);
            } catch (err) {
              if (res.headersSent) {
                try {
                  res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
                } catch {
                  /* socket already gone */
                }
                try {
                  res.end();
                } catch {
                  /* socket already gone */
                }
              } else {
                res.status(500).json({ ok: false, error: err.message });
              }
            }
          };
        }),
      );
  }
  return router;
}
