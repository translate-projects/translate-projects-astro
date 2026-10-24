// Local stand-in for the Translate Projects API: HTTP endpoints + progress WebSocket.
// "Translates" by prefixing each source text with "[lang] ".
const http = require('http');
const { WebSocketServer } = require('ws');
const { generateHashText } = require('translate-projects-core/utils');

/**
 * @param {object} opts
 * @param {Record<string, number>} [opts.failStatus] path -> HTTP status to always answer
 * @param {string[]} [opts.failLangs] target languages whose translation request gets a 500
 * @param {Record<string, string[]>} [opts.partial] lang -> source texts answered as ""
 *   (what the backend does on MISSING_API_KEY)
 */
const startMockApi = async ({
  failStatus = {},
  failLangs = [],
  partial = {},
} = {}) => {
  const state = { sources: {}, seenHashes: {}, requests: [] };
  const tasks = {};
  let nextTask = 0;

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const task = (res) => {
    const id = `task-${nextTask++}`;
    tasks[id] = true;
    reply(res, 200, { status: 'ok', message: '', data: { task_id: id } });
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const url = new URL(req.url, 'http://x');
      const q = Object.fromEntries(url.searchParams);
      const body = raw ? JSON.parse(raw) : null;
      state.requests.push({ method: req.method, path: url.pathname, q, body });

      if (failStatus[url.pathname]) {
        const status = failStatus[url.pathname];
        return reply(res, status, {
          status: 'error',
          message: status === 401 ? 'Invalid token.' : `mock ${status}`,
        });
      }
      if (url.pathname === '/v1/translations/validate-changes-files') {
        const changed = {};
        for (const [file, hash] of Object.entries(body || {})) {
          if (state.seenHashes[file] !== hash) changed[file] = true;
        }
        return reply(res, 200, { status: 'ok', message: '', data: changed });
      }
      if (url.pathname === '/v1/translations/load-sources') {
        Object.assign(state.sources, body);
        // like the backend: file hash = hash(route_file), version = cache_hash
        state.seenHashes[await generateHashText(q.route_file)] = q.cache_hash;
        return task(res);
      }
      if (url.pathname === '/v1/translations/' && req.method === 'POST') {
        if (failLangs.includes(q.target_lang)) {
          return reply(res, 500, { status: 'error', message: 'mock 500' });
        }
        return task(res);
      }
      if (url.pathname === '/v1/translations/language-project') {
        const skip = partial[q.target_lang] || [];
        const data = {};
        for (const [k, v] of Object.entries(state.sources))
          data[k] = skip.includes(v) ? '' : `[${q.target_lang}] ${v}`;
        return reply(res, 200, { status: 'ok', message: '', data });
      }
      reply(res, 404, { status: 'error', message: 'not found' });
    });
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ progress: '50' }));
    setTimeout(() => socket.send(JSON.stringify({ progress: '100' })), 50);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    count: (path) => state.requests.filter((r) => r.path === path).length,
    close: () => {
      wss.clients.forEach((c) => c.terminate());
      return new Promise((r) => server.close(r));
    },
  };
};

module.exports = { startMockApi };
