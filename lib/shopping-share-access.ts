export function parseShoppingAccess(search: URLSearchParams): { p_token?: string; p_share_id?: string } | null {
  const token = search.get("token");
  const share = search.get("share");
  if ((token !== null && share !== null) || search.getAll("token").length > 1 || search.getAll("share").length > 1) return null;
  if (token !== null) return /^[a-f0-9]{64}$/.test(token) ? { p_token: token } : null;
  if (share !== null) return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(share) ? { p_share_id: share } : null;
  return {};
}
