export function notFound(_req, res) {
  res.status(404).json({ error: "NOT_FOUND" });
}

export function errorHandler(err, _req, res, _next) {
  console.error(err);
  if (res.headersSent) {
    return;
  }

  if (err?.name === "MulterError") {
    return res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
  }

  if (typeof err?.message === "string" && err.message.length > 0) {
    return res.status(400).json({ error: "BAD_REQUEST", message: err.message });
  }

  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}
