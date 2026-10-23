// Local-only proxy for exercising the real frontend against disposable Auth and CAT.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { counts } from '../supabase/functions/_shared/sata-presentation.mjs';
const env = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (env.API_URL !== 'http://127.0.0.1:54321') throw new Error('Disposable loopback Supabase only.');
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const origin = 'http://127.0.0.1:54330', sdkURL = origin + '/local-supabase';
async function api(path, method = 'GET', body, token = env.SERVICE_ROLE_KEY) {
  const target = new URL(path, env.API_URL);
  if (target.origin !== env.API_URL) throw new Error('Nonlocal target blocked.');
  const response = await fetch(target, { method, headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
const keys = await api('/rest/v1/in_house_diagnostic_item_keys');
if (!keys.every(k => k.item_source === 'local-synthetic')) throw new Error('Synthetic inventory required.');
const publicItem = key => ({
  id: key.item_id, ...(key.parent_item_id ? { qid: key.item_id.split(':').pop() } : {}), type: key.item_type, difficulty: key.difficulty,
  category: key.category, blueprint: key.blueprint, nclexCategory: key.nclex_category,
  stem: `Synthetic browser question ${key.item_id}`, options: Array.from({ length: counts[key.item_id] || 4 }, (_, i) => `Synthetic choice ${i}`),
  ...(key.item_type === 'casestudy' ? { scenario: 'Synthetic case record', tabs: [{ label: 'Notes', content: 'Synthetic chart' }],
    questions: keys.filter(k => k.parent_item_id === key.item_id).map(publicItem) } : {}),
});
const banks = Object.fromEntries(['diagnostic', 'remediation'].map(scope => [
  scope === 'diagnostic' ? 'questionBank' : 'remediationBank', keys.filter(k => k.bank_scope === scope && k.selectable).map(publicItem),
]));
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, origin);
    if (url.pathname.startsWith('/local-supabase/')) {
      const target = new URL(url.pathname.slice('/local-supabase'.length) + url.search, env.API_URL);
      if (target.origin !== env.API_URL) throw new Error('Nonlocal proxy target blocked.');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const headers = { ...request.headers, host: '127.0.0.1:54321', origin: 'https://portal.studywithmadison.com' };
      delete headers['content-length'];
      const upstream = await fetch(target, { method: request.method, headers,
        ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: Buffer.concat(chunks) }) });
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
      response.end(Buffer.from(await upstream.arrayBuffer())); return;
    }
    if (url.pathname === '/test-login') {
      const mode = url.searchParams.get('mode') || 'practice';
      const ngn = url.searchParams.get('ngn') === '1';
      const admin = url.searchParams.get('admin') === '1';
      if (!['practice', 'nclex', 'mock', 'assessment', 'remediation', 'traditional'].includes(mode)) throw new Error('Invalid test mode.');
      const email = `sata-browser-${randomUUID()}@example.test`, password = randomUUID() + '-Aa9!';
      const user = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
      const [student] = await api('/rest/v1/students', 'POST', { name: 'Synthetic browser tester', email, pin: 'local-only',
        auth_user_id: user.id, portal_stage: mode === 'assessment' ? 'assessment' : 'active',
        ...(mode === 'traditional' ? { student_type: 'nursing_student' } : {}) });
      if (admin) await api('/rest/v1/app_admins', 'POST', { user_id: user.id });
      const session = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, env.ANON_KEY);
      const started = !admin && mode !== 'traditional' && await api('/functions/v1/diagnostic-assessment', 'POST', {
        action: 'start', mode, optionProtocol: 'sata-order-v1', sessionKey: randomUUID(), profile: {
          mode, qCount: mode === 'remediation' ? 2 : url.searchParams.get('count') === '5' ? 5 : 1,
        },
        ...(ngn ? { clientProtocol: 'ngn-cat-v1' } : {}),
      }, session.access_token);
      // Force one known synthetic SATA presentation for browser coverage, only on this new test account.
      if (started && !ngn) await api(`/rest/v1/in_house_assessment_attempts?id=eq.${started.attempt.id}&student_id=eq.${student.id}`, 'PATCH', {
        checkpoint: { ...started.attempt.checkpoint, currentItemId: mode === 'remediation' ? 'cs1' : 'm6' },
      });
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Content-Security-Policy': "connect-src 'self'" });
      response.end(`<html><body><p>Signing into disposable local Auth...</p><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>
        (async()=>{const db=supabase.createClient(${JSON.stringify(sdkURL)},${JSON.stringify(env.ANON_KEY)});
        const result=await db.auth.signInWithPassword(${JSON.stringify({ email, password })});
        if(result.error)throw result.error;location.href=${JSON.stringify(admin ? '/question-bank-review.html' : mode === 'traditional' ? '/supplemental-practice.html' : '/diagnostic.html' + (mode === 'assessment' ? '?mode=assessment' : ''))};})();</script></body></html>`);
      return;
    }
    if (url.pathname === '/diagnostic-question-bank.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      response.end('window.DIAGNOSTIC_BANKS=' + JSON.stringify(banks) + ';'); return;
    }
    const file = resolve(root, '.' + url.pathname), extension = extname(file);
    if (!file.startsWith(root + '/') || url.pathname.includes('/.') || !['.html', '.js', '.css', '.svg', '.png'].includes(extension)) {
      response.writeHead(403); response.end('Unavailable'); return;
    }
    let data = readFileSync(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    if (types[extension]) data = Buffer.from(data.toString().replaceAll('https://pmjwwktwlsqpetwfvolb.supabase.co', sdkURL)
      .replaceAll('sb_publishable_MDgerX5UJd44TlYgMOalDw_DqNMvxfT', env.ANON_KEY));
    response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "connect-src 'self'" });
    response.end(data);
  } catch (error) {
    console.error(error.message); response.writeHead(500); response.end('Isolated test helper failed; inspect local logs.');
  }
}).listen(54330, '127.0.0.1', () => console.log('Local synthetic frontend ready: http://127.0.0.1:54330/test-login'));
