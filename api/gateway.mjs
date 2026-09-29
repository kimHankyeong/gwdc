// Vercel serves the real UI; durable workers remain on their configured origins.
// No localhost tunnel, demo fallback, tokens, or signing keys are shipped here.
const allowedPath = /^(health|scopes|policies\/[\w-]+|agent\/runs(?:\/[\w-]+(?:\/(?:resume|events|constraint-approvals))?)?|purchase-intents\/[\w-]+\/(?:approvals|refresh)|receipts(?:\/[\w-]+(?:\/audit)?)?|policy-edit-sessions(?:\/[\w-]+(?:\/publish)?)?)$/;
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, error) => res.status(status).json({error});
  if (!['GET','POST','DELETE'].includes(req.method)) return fail(405,'METHOD_NOT_ALLOWED');
  const route = req.query?.path;
  if (typeof route !== 'string' || !allowedPath.test(route)) return fail(404,'NOT_FOUND');
  const admin = route.startsWith('policy-edit-sessions');
  const configured = admin ? process.env.POLICY_API_ORIGIN : process.env.BACKEND_API_ORIGIN;
  if (!configured) return fail(503,admin?'POLICY_ADMIN_UNAVAILABLE':'BACKEND_NOT_CONFIGURED');
  let origin;
  try {
    origin = new URL(configured);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || /^(localhost|127\.|\[::1\])/.test(origin.hostname)) throw Error();
  } catch { return fail(503,'BACKEND_NOT_CONFIGURED'); }
  const auth = req.headers.authorization;
  if (route !== 'health' && (typeof auth !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(auth))) return fail(401,'UNAUTHORIZED');
  const body = req.method === 'GET' ? undefined : JSON.stringify(req.body ?? {});
  if (body && Buffer.byteLength(body)>32768) return fail(413,'INVALID_INPUT');
  try {
    const upstream = await fetch(new URL('/api/'+route,origin), {
      method:req.method, redirect:'error', signal:AbortSignal.timeout(55000),
      headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})}, body,
    });
    if (!upstream.headers.get('content-type')?.includes('application/json')) return fail(502,'SERVICE_UNAVAILABLE');
    const reader=upstream.body?.getReader();
    if (!reader) return fail(502,'SERVICE_UNAVAILABLE');
    const chunks=[];let length=0;
    for (;;) { const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2097152){await reader.cancel();return fail(502,'SERVICE_UNAVAILABLE');}chunks.push(value); }
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return res.status(upstream.status).json(data);
  } catch { return fail(502,'SERVICE_UNAVAILABLE'); }
}
