import app from '../apps/api/dist/app.js';

export default function handler(req, res) {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const forwardedPath = incoming.searchParams.get('path');

  if (forwardedPath) {
    incoming.searchParams.delete('path');
    req.url = `/api/${forwardedPath}${incoming.search}`;
  }

  return app(req, res);
}
