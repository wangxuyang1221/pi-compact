export function redirect(r) {
  if (!['GET', 'HEAD'].includes(r.method)) return null;
  const m = /^\/(en|fr)\/old\/([^/]+)$/.exec(r.path);
  if (!m) return null;
  return { status: 308, location: '/' + m[1] + '/articles/' + m[2] + (r.query ? '?' + r.query : '') };
}
