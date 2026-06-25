import http from 'node:http';

const port = process.argv[2] ?? process.env.CDP_PORT ?? '9333';
const url = `http://localhost:${port}/json/list`;

const getJson = (targetUrl) =>
  new Promise((resolve, reject) => {
    const request = http.get(targetUrl, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`CDP target request failed with HTTP ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
  });

try {
  const targets = await getJson(url);

  if (!Array.isArray(targets) || targets.length === 0) {
    console.log(`No CDP targets found at ${url}`);
    process.exit(0);
  }

  for (const [index, target] of targets.entries()) {
    console.log(`${index}: [${target.type ?? 'unknown'}] ${target.title || '(untitled)'}`);
    if (target.url) console.log(`   ${target.url}`);
    if (target.webSocketDebuggerUrl) console.log(`   ${target.webSocketDebuggerUrl}`);
  }
} catch (error) {
  console.error(`Unable to list CDP targets at ${url}`);
  console.error(error?.message ?? error);
  process.exit(1);
}
