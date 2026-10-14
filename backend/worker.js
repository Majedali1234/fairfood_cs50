// ============================================================
// FAIRFOOD - Cloudflare Worker ط§ظ„ط±ط¦ظٹط³ظٹ
// ط§ظ„ط¥طµط¯ط§ط±: 2.0 - ط§ظ„ط¥ط·ظ„ط§ظ‚ ط§ظ„ظƒط§ظ…ظ„
// ظٹط´ظ…ظ„: Auth, Restaurants, Menu, Orders, Drivers, Wallet,
//        Documents, Ratings, Support, Push, Stripe, WebSocket, GPS
// ============================================================

const encoder = new TextEncoder();

// -------------------- ط¯ظˆط§ظ„ ظ…ط³ط§ط¹ط¯ط© (Helpers) --------------------

// ط¥ط¹ط¯ط§ط¯ط§طھ CORS ظ„ظ„ط£ظ…ط§ظ†
function cors(env) {
  return {
    "access-control-allow-origin": env.CORS_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-requested-with",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  };
}

// ط§ط³طھط¬ط§ط¨ط© JSON ظ†ط§ط¬ط­ط©
function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(env) }
  });
}

// ط§ط³طھط¬ط§ط¨ط© ظ†ط¬ط§ط­ ظ…ط®طھطµط±ط©
function ok(data = {}, env = {}, status = 200) {
  return json({ success: true, ...data }, status, env);
}

// ط§ط³طھط¬ط§ط¨ط© ط®ط·ط£ ظ…ط®طھطµط±ط©
function fail(message, status = 400, code = "ERROR", env = {}) {
  return json({ success: false, error: { code, message } }, status, env);
}

// ط¥ظ†ط´ط§ط، ID ظپط±ظٹط¯
function uid(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

// ظ‚ط±ط§ط،ط© ط¬ط³ظ… ط§ظ„ط·ظ„ط¨ ظƒظ€ JSON
async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ظ‚ط±ط§ط،ط© ط¨ظٹط§ظ†ط§طھ FormData (ظ„ط±ظپط¹ ط§ظ„ظ…ظ„ظپط§طھ)
async function readFormData(request) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

// ط±ظپط¹ ظ…ظ„ظپ ط¥ظ„ظ‰ R2 (ظ…ط¹ fallback ط¥ظ„ظ‰ Base64)
async function uploadFile(env, key, buf, contentType) {
  if (env.R2) {
    try {
      await env.R2.put(key, buf, { httpMetadata: { contentType } });
      return `/api/files/${key}`;
    } catch (e) {
      // fallback ط¥ظ„ظ‰ Base64
    }
  }
  return `data:${contentType};base64,${bufToB64(buf)}`;
}

// ظ‚ط±ط§ط،ط© ظ…ظ„ظپ ظ…ظ† R2
async function serveFile(env, key) {
  if (!env.R2) return null;
  try {
    const obj = await env.R2.get(key);
    if (!obj) return null;
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'cache-control': 'public, max-age=86400'
      }
    });
  } catch { return null; }
}

// طھط­ظˆظٹظ„ ArrayBuffer ط¥ظ„ظ‰ Base64
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ظ‚ط±ط§ط،ط© body ظ…ط¹ ط¯ط¹ظ… FormData (ظ„ظ„ظ…ظ†ظٹظˆ)
async function parseMenuBody(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("multipart")) {
    const fd = await readFormData(request);
    if (!fd) return { b: {} };
    const b = {};
    for (const key of ["name", "description", "price", "category", "categoryId", "category_id", "priceCents", "price_cents", "tags", "inventoryCount", "inventory_count", "available", "image", "imageUrl", "sortOrder", "sort_order"]) {
      b[key] = fd.get(key);
    }
    const imgFile = fd.get("image");
    if (imgFile && imgFile.size > 0) {
      const buf = await imgFile.arrayBuffer();
      return { b, imgBuf: buf, imgType: imgFile.type };
    }
    return { b };
  }
  return { b: await readBody(request) };
}

// -------------------- ط¯ظˆط§ظ„ ط§ظ„طھط´ظپظٹط± ظˆط§ظ„ط£ظ…ط§ظ† --------------------

// طھط´ظپظٹط± SHA-256
async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ط¥ظ†ط´ط§ط، ظƒظ„ظ…ط© ظ…ط±ظˆط± ظ…ط´ظپط±ط©
async function hashPassword(password) {
  const salt = crypto.randomUUID().replaceAll("-", "");
  return `sha256$${salt}$${await sha256Hex(salt + password)}`;
}

// ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±
async function verifyPassword(password, stored) {
  const [type, salt, hash] = String(stored || "").split("$");
  if (type !== "sha256") return false;
  return await sha256Hex(salt + password) === hash;
}

// طھط±ظ…ظٹط² Base64 URL-safe
function b64urlEncode(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

// ظپظƒ طھط±ظ…ظٹط² Base64 URL-safe
function b64urlDecode(str) {
  str = str.replaceAll("-", "+").replaceAll("_", "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

// HMAC-SHA256 ظ„ظ„طھظˆظ‚ظٹط¹
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(data));
}

// طھظˆظ‚ظٹط¹ JWT
async function signJwt(payload, env) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlEncode(JSON.stringify({
    ...payload,
    iss: env.JWT_ISSUER || "fairfood",
    iat: now,
    exp: now + Number(env.ACCESS_TOKEN_TTL_SECONDS || 86400)
  }));
  const data = `${header}.${body}`;
  const sig = b64urlEncode(new Uint8Array(await hmac(env.JWT_SECRET || "dev-secret-change-me", data)));
  return `${data}.${sig}`;
}

// ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† JWT
async function verifyJwt(token, env) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) throw new Error("Invalid token");
  const data = `${h}.${p}`;
  const expected = b64urlEncode(new Uint8Array(await hmac(env.JWT_SECRET || "dev-secret-change-me", data)));
  if (expected !== s) throw new Error("Invalid signature");
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return payload;
}

// ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ط­ط§ظ„ظٹ ظ…ظ† ط§ظ„طھظˆظƒظ†
async function currentUser(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const payload = await verifyJwt(token, env);
  return env.DB.prepare("SELECT id, role, name, email, phone, status, avatar_url FROM users WHERE id=? AND status='active'").bind(payload.sub).first();
}

// ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„طµظ„ط§ط­ظٹط© ظˆط¯ظˆط± ط§ظ„ظ…ط³طھط®ط¯ظ…
async function requireAuth(request, env, roles = null) {
  const user = await currentUser(request, env).catch(() => null);
  if (!user) return { error: fail("Authentication required", 401, "AUTH_REQUIRED", env) };
  if (roles && ![].concat(roles).includes(user.role)) return { error: fail("Forbidden", 403, "FORBIDDEN", env) };
  return { user };
}

// طھط³ط¬ظٹظ„ ظپظٹ ط³ط¬ظ„ ط§ظ„طھط¯ظ‚ظٹظ‚ (ظ„ظ„ط£ط¯ظ…ظ†)
async function audit(env, actor, action, entityType = null, entityId = null, request = null) {
  const ip = request?.headers?.get("cf-connecting-ip") || request?.headers?.get("x-forwarded-for") || null;
  await env.DB.prepare("INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, ip) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(uid("aud"), actor?.id || null, action, entityType, entityId, ip).run().catch(() => {});
}

// ط§ظ„ط­ط¯ ظ…ظ† ط³ط±ط¹ط© ط§ظ„ط·ظ„ط¨ط§طھ (Rate Limiting)
async function rateLimit(request, env, limit = 600) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = "rl:" + ip;
  const now = Math.floor(Date.now() / 1000);
  const bucket = await env.DB.prepare("SELECT * FROM rate_limits WHERE key=?").bind(key).first().catch(() => null);
  if (!bucket || bucket.reset_at < now) {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (key,count,reset_at) VALUES (?,1,?)").bind(key, now + 60).run().catch(() => {});
    return true;
  }
  if (bucket.count >= limit) return false;
  await env.DB.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").bind(key).run().catch(() => {});
  return true;
}

// ط¥ظ†ط´ط§ط، ط¥ط´ط¹ط§ط± ط¯ط§ط®ظ„ظٹ
async function notify(env, userId, title, body) {
  if (!userId) return;
  await env.DB.prepare("INSERT INTO notifications (id,user_id,title,body) VALUES (?,?,?,?)")
    .bind(uid("n"), userId, title, body || "").run().catch(() => {});
}

// ط¥ط¶ط§ظپط© ط­ط¯ط« ظ„ط³ط¬ظ„ ط§ظ„ط·ظ„ط¨
async function addEvent(env, orderId, actorId, type, note) {
  await env.DB.prepare("INSERT INTO order_events (id, order_id, actor_user_id, event_type, note) VALUES (?, ?, ?, ?, ?)")
    .bind(uid("ev"), orderId, actorId || null, type, note || type).run();
}

// ط­ط³ط§ط¨ ط§ظ„ظ…ط³ط§ظپط© ط¨ظٹظ† ظ†ظ‚ط·طھظٹظ† (ظƒظٹظ„ظˆظ…طھط±)
function distanceKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some(v => v === null || v === undefined || Number.isNaN(Number(v)))) return 999999;
  const R = 6371, dLat = (Number(bLat) - Number(aLat)) * Math.PI / 180, dLng = (Number(bLng) - Number(aLng)) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(Number(aLat) * Math.PI / 180) * Math.cos(Number(bLat) * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ============================================================
// ط§ظ„ط¹ظ…ظ„ط§طھ ط§ظ„ط¹ط§ظ„ظ…ظٹط© - ISO 4217
// ============================================================
const COUNTRY_CURRENCY = {
  'SA': 'SAR', 'AE': 'AED', 'EG': 'EGP', 'JO': 'JOD', 'KW': 'KWD',
  'BH': 'BHD', 'QA': 'QAR', 'OM': 'OMR', 'LB': 'LBP', 'IQ': 'IQD',
  'SY': 'SYP', 'YE': 'YER', 'PS': 'ILS', 'MA': 'MAD', 'TN': 'TND',
  'DZ': 'DZD', 'LY': 'LYD', 'SD': 'SDG', 'SO': 'SOS', 'DJ': 'DJF',
  'KM': 'KMF', 'MR': 'MRU', 'US': 'USD', 'CA': 'CAD', 'MX': 'MXN',
  'BR': 'BRL', 'AR': 'ARS', 'CL': 'CLP', 'CO': 'COP', 'PE': 'PEN',
  'DE': 'EUR', 'FR': 'EUR', 'IT': 'EUR', 'ES': 'EUR', 'NL': 'EUR',
  'BE': 'EUR', 'AT': 'EUR', 'PT': 'EUR', 'IE': 'EUR', 'FI': 'EUR',
  'GB': 'GBP', 'CH': 'CHF', 'SE': 'SEK', 'NO': 'NOK', 'DK': 'DKK',
  'PL': 'PLN', 'CZ': 'CZK', 'HU': 'HUF', 'RO': 'RON', 'BG': 'BGN',
  'HR': 'EUR', 'RS': 'RSD', 'BA': 'BAM', 'ME': 'EUR', 'MK': 'MKD',
  'AL': 'ALL', 'GR': 'EUR', 'CY': 'EUR', 'MT': 'EUR', 'TR': 'TRY',
  'IL': 'ILS', 'CN': 'CNY', 'JP': 'JPY', 'KR': 'KRW', 'IN': 'INR',
  'AU': 'AUD', 'NZ': 'NZD', 'SG': 'SGD', 'HK': 'HKD', 'TW': 'TWD',
  'MY': 'MYR', 'TH': 'THB', 'VN': 'VND', 'ID': 'IDR', 'PH': 'PHP',
  'ZA': 'ZAR', 'NG': 'NGN', 'KE': 'KES', 'GH': 'GHS', 'ET': 'ETB',
  'TZ': 'TZS', 'UG': 'UGX', 'RW': 'RWF', 'ZW': 'ZWL', 'MW': 'MWK',
  'MZ': 'MZN', 'BW': 'BWP', 'NA': 'NAD', 'SZ': 'SZL', 'LS': 'LSL',
  'SC': 'SCR', 'MU': 'MUR', 'MG': 'MGA', 'CV': 'CVE',
  'ST': 'STN', 'TD': 'XAF', 'CF': 'XAF', 'CG': 'XAF', 'CM': 'XAF',
  'GA': 'XAF', 'GQ': 'XAF', 'SN': 'XOF', 'ML': 'XOF', 'BF': 'XOF',
  'CI': 'XOF', 'NE': 'XOF', 'TG': 'XOF', 'BJ': 'XOF', 'GW': 'XOF',
  'GN': 'GNF', 'LR': 'LRD', 'SL': 'SLE', 'GM': 'GMD',
  'AF': 'AFN', 'BD': 'BDT', 'BT': 'BTN', 'KH': 'KHR', 'LA': 'LAK',
  'MN': 'MNT', 'MM': 'MMK', 'NP': 'NPR', 'PK': 'PKR', 'LK': 'LKR',
  'MV': 'MVR', 'TL': 'USD', 'BN': 'BND', 'KZ': 'KZT', 'KG': 'KGS',
  'TJ': 'TJS', 'TM': 'TMT', 'UZ': 'UZS', 'AZ': 'AZN', 'AM': 'AMD',
  'GE': 'GEL', 'BY': 'BYN', 'UA': 'UAH', 'MD': 'MDL',
  'XK': 'EUR',
  'SI': 'EUR', 'SK': 'EUR', 'LT': 'EUR', 'LV': 'EUR', 'EE': 'EUR',
};

const currencyCache = new Map();

async function getCurrencyFromCoords(lat, lng) {
  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (currencyCache.has(key)) return currencyCache.get(key);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'User-Agent': 'Fairfood/2.0' }}
    );
    const data = await res.json();
    const countryCode = data.address?.country_code?.toUpperCase();
    const currency = COUNTRY_CURRENCY[countryCode] || 'USD';
    currencyCache.set(key, currency);
    return currency;
  } catch {
    return 'USD';
  }
}

// طھظ†ط³ظٹظ‚ ط§ظ„ط³ط¹ط± ط¨ط§ط³طھط®ط¯ط§ظ… Intl.NumberFormat (ظ…ط­ظ„ظٹ)
function formatPrice(cents, currencyCode, locale = 'ar-SA') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(0) + ' ' + currencyCode.toUpperCase();
  }
}

// ط¥ظ†ط´ط§ط، ظ…ط­ظپط¸ط© ط¥ط°ط§ ظ„ظ… طھظƒظ† ظ…ظˆط¬ظˆط¯ط©
async function createWalletIfMissing(env, ownerType, ownerId) {
  const existing = await env.DB.prepare("SELECT id FROM wallets WHERE owner_type=? AND owner_id=?").bind(ownerType, ownerId).first();
  if (existing) return existing.id;
  const wid = uid("w");
  await env.DB.prepare("INSERT INTO wallets (id,owner_type,owner_id,balance_cents,pending_cents) VALUES (?,?,?,?,?)").bind(wid, ownerType, ownerId, 0, 0).run();
  return wid;
}

// ط¥ط¶ط§ظپط© ط±طµظٹط¯ ظ„ظ„ظ…ط­ظپط¸ط©
async function creditWallet(env, ownerType, ownerId, orderId, amount, note) {
  const wid = await createWalletIfMissing(env, ownerType, ownerId);
  await env.DB.batch([
    env.DB.prepare("UPDATE wallets SET balance_cents=balance_cents+? WHERE id=?").bind(amount, wid),
    env.DB.prepare("INSERT INTO wallet_transactions (id,wallet_id,order_id,type,amount_cents,note) VALUES (?,?,?,?,?,?)").bind(uid("wt"), wid, orderId, "credit", amount, note)
  ]);
}

// ط¬ظ„ط¨ طھظپط§طµظٹظ„ ط§ظ„ط·ظ„ط¨ ظ…ط¹ ط§ظ„ظ…ط·ط¹ظ…
async function getOrder(env, id) {
  return env.DB.prepare("SELECT o.*, r.name restaurant_name, r.address restaurant_address, r.lat restaurant_lat, r.lng restaurant_lng, r.currency restaurant_currency, r.owner_user_id FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.id=?").bind(id).first();
}

// ط¥ظٹط¬ط§ط¯ ط£ظپط¶ظ„ ط³ط§ط¦ظ‚ ظ…طھط§ط­ ظ‚ط±ظٹط¨ ظ…ظ† ط§ظ„ظ…ط·ط¹ظ…
async function dispatchBestDriver(env, order) {
  const drivers = (await env.DB.prepare("SELECT * FROM drivers WHERE status='online' AND verification_status='approved'").all()).results || [];
  if (!drivers.length) return null;
  const ranked = drivers.map(d => ({ ...d, score: distanceKm(order.restaurant_lat, order.restaurant_lng, d.lat, d.lng) })).sort((a, b) => a.score - b.score);
  return ranked[0] || null;
}

// ط¥ط±ط³ط§ظ„ ط¥ط´ط¹ط§ط±ط§طھ Push ط¹ط¨ط± WebPush API (ط¨ط³ط·ظ†ط§ظ‡ط§ ظ„ط¯ط¹ظ… Firebase/WebPush ظ„ط§ط­ظ‚ظ‹ط§)
async function sendPushNotification(env, userId, title, body, data = {}) {
  try {
    const tokens = (await env.DB.prepare("SELECT device_token, platform FROM push_tokens WHERE user_id=? AND is_active=1").bind(userId).all()).results || [];
    for (const t of tokens) {
      // ظ‡ظ†ط§ ظٹطھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¥ط´ط¹ط§ط± ط­ط³ط¨ ط§ظ„ظ…ظ†طµط© (iOS/Android/Web)
      // ط­ط§ظ„ظٹظ‹ط§ ظ†ط³ط¬ظ„ ظپظ‚ط· - ظ„طھظپط¹ظٹظ„ ط§ظ„ط¥ط±ط³ط§ظ„ ط§ظ„ظپط¹ظ„ظٹ طھط­طھط§ط¬ FCM Server Key ظپظٹ env.FCM_SERVER_KEY
      if (env.FCM_SERVER_KEY && t.platform !== "web") {
        await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "key=" + env.FCM_SERVER_KEY },
          body: JSON.stringify({ to: t.device_token, notification: { title, body }, data })
        }).catch(() => {});
      }
    }
  } catch (e) { /* طھط¬ط§ظ‡ظ„ ط£ط®ط·ط§ط، ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ */ }
}

// -------------------- WebSocket Connections Registry --------------------
// ظ‡ط°ط§ ط§ظ„ط³ط¬ظ„ ظٹط­طھظپط¸ ط¨ط§طھطµط§ظ„ط§طھ WebSocket ط§ظ„ظ†ط´ط·ط© ط¯ط§ط®ظ„ ظ†ظپط³ Worker Instance
// ظ…ظ„ط§ط­ط¸ط©: ظپظٹ Cloudflare Workers ط¨ط¯ظˆظ† Durable ObjectsطŒ ط§ظ„ط§طھطµط§ظ„ط§طھ ط¹ط§ط¨ط±ط©
// ظ„ظƒظ†ظ‡ط§ ظƒط§ظپظٹط© ظ„ظ„طھط­ط¯ظٹط«ط§طھ ط§ظ„ظ„ط­ط¸ظٹط© ط§ظ„ط¨ط³ظٹط·ط©

const wsClients = new Map(); // ظ…ظپطھط§ط­: "order:{orderId}" -> Set<WebSocket>

// ط¨ط« ط­ط¯ط« ط¥ظ„ظ‰ ط¬ظ…ظٹط¹ ط§ظ„ظ…ط´طھط±ظƒظٹظ† ظپظٹ ط·ظ„ط¨ ظ…ط¹ظٹظ†
function broadcastToOrder(orderId, event, data) {
  const key = "order:" + orderId;
  const subscribers = wsClients.get(key);
  if (!subscribers) return;
  const message = JSON.stringify({ event, data, orderId });
  for (const ws of subscribers) {
    try {
      ws.send(message);
    } catch (e) {
      subscribers.delete(ws);
    }
  }
  if (subscribers.size === 0) wsClients.delete(key);
}

// ط¨ط« ط­ط¯ط« ظ„ط¬ظ…ظٹط¹ ط§ظ„ط³ط§ط¦ظ‚ظٹظ† ط§ظ„ظ…طھطµظ„ظٹظ†
function broadcastToDrivers(event, data) {
  const key = "drivers";
  const subscribers = wsClients.get(key);
  if (!subscribers) return;
  const message = JSON.stringify({ event, data });
  for (const ws of subscribers) {
    try {
      ws.send(message);
    } catch (e) {
      subscribers.delete(ws);
    }
  }
  if (subscribers.size === 0) wsClients.delete(key);
}

// ط¨ط« ط­ط¯ط« ظ„ط¬ظ…ظٹط¹ ط§ظ„ظ…ط·ط§ط¹ظ…
function broadcastToRestaurants(event, data) {
  const key = "restaurants";
  const subscribers = wsClients.get(key);
  if (!subscribers) return;
  const message = JSON.stringify({ event, data });
  for (const ws of subscribers) {
    try {
      ws.send(message);
    } catch (e) {
      subscribers.delete(ws);
    }
  }
  if (subscribers.size === 0) wsClients.delete(key);
}

// ============================================================
// ظ…ط¹ط§ظ„ط¬ WebSocket (ظ„ظ„ط§طھطµط§ظ„ ط§ظ„ظ…ط¨ط§ط´ط±)
// ============================================================
function handleWebSocket(request, env) {
  const upgrade = request.headers.get("Upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") return null;

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.accept();

  // ط¥ط±ط³ط§ظ„ طھط£ظƒظٹط¯ ط§ظ„ط§طھطµط§ظ„
  server.send(JSON.stringify({ event: "connected", data: { message: "ظ…ط±ط­ط¨ط§ظ‹ ط¨ظƒ ظپظٹ Fairfood Realtime" } }));

  // ط§ط³طھظ‚ط¨ط§ظ„ ط§ظ„ط±ط³ط§ط¦ظ„ ظ…ظ† ط§ظ„ط¹ظ…ظٹظ„
  server.addEventListener("message", (event) => {
    try {
      const msg = JSON.parse(event.data);

      // ط§ظ„ط§ظ†ط¶ظ…ط§ظ… ط¥ظ„ظ‰ ط؛ط±ظپط© ط·ظ„ط¨ ظ…ط¹ظٹظ† (ظ„ظ„ط¹ظ…ظٹظ„)
      if (msg.type === "join:order" && msg.orderId) {
        const key = "order:" + msg.orderId;
        if (!wsClients.has(key)) wsClients.set(key, new Set());
        wsClients.get(key).add(server);
        server.send(JSON.stringify({ event: "joined", data: { orderId: msg.orderId } }));
      }

      // ط§ظ„ط§ظ†ط¶ظ…ط§ظ… ط¥ظ„ظ‰ ط¨ط« ط§ظ„ط³ط§ط¦ظ‚ظٹظ†
      if (msg.type === "join:drivers") {
        if (!wsClients.has("drivers")) wsClients.set("drivers", new Set());
        wsClients.get("drivers").add(server);
        server.send(JSON.stringify({ event: "joined", data: { channel: "drivers" } }));
      }

      // ط§ظ„ط§ظ†ط¶ظ…ط§ظ… ط¥ظ„ظ‰ ط¨ط« ط§ظ„ظ…ط·ط§ط¹ظ…
      if (msg.type === "join:restaurants") {
        if (!wsClients.has("restaurants")) wsClients.set("restaurants", new Set());
        wsClients.get("restaurants").add(server);
        server.send(JSON.stringify({ event: "joined", data: { channel: "restaurants" } }));
      }

      // ط§ظ„ط®ط±ظˆط¬ ظ…ظ† ط§ظ„ط؛ط±ظپط©
      if (msg.type === "leave" && msg.orderId) {
        const key = "order:" + msg.orderId;
        const subs = wsClients.get(key);
        if (subs) {
          subs.delete(server);
          if (subs.size === 0) wsClients.delete(key);
        }
      }

    } catch (e) { /* طھط¬ط§ظ‡ظ„ ط§ظ„ط±ط³ط§ط¦ظ„ ط؛ظٹط± ط§ظ„طµط§ظ„ط­ط© */ }
  });

  // طھظ†ط¸ظٹظپ ط¹ظ†ط¯ ظ‚ط·ط¹ ط§ظ„ط§طھطµط§ظ„
  server.addEventListener("close", () => {
    for (const [key, subs] of wsClients) {
      if (subs.has(server)) {
        subs.delete(server);
        if (subs.size === 0) wsClients.delete(key);
      }
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}

// ============================================================
// ط§ظ„طھط·ط¨ظٹظ‚ ط§ظ„ط±ط¦ظٹط³ظٹ - ط¬ظ…ظٹط¹ ظ…ط³ط§ط±ط§طھ API
// ============================================================
async function app(request, env) {
  // ظ…ط¹ط§ظ„ط¬ط© ط·ظ„ط¨ط§طھ CORS ط§ظ„ظ…ط³ط¨ظ‚ط© (OPTIONS)
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظ…ط¹ط¯ظ„ ط§ظ„ط·ظ„ط¨ط§طھ
  if (!(await rateLimit(request, env))) return fail("Too many requests", 429, "RATE_LIMIT", env);

  const url = new URL(request.url);
  let path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  // -------------------- ط¯ط¹ظ… ظƒظ„ط§ ط§ظ„ظ…ط³ط§ط±ظٹظ† /api/ ظˆ /api/v1/ --------------------
  // ط§ظ„طھط·ط¨ظٹظ‚ط§طھ ط§ظ„ط¬ط¯ظٹط¯ط© طھط³طھط®ط¯ظ… /api/v1/ ظˆط§ظ„طھط·ط¨ظٹظ‚ط§طھ ط§ظ„ظ‚ط¯ظٹظ…ط© طھط³طھط®ط¯ظ… /api/
  if (path.startsWith("/api/v1/")) {
    path = "/api/" + path.slice(8);
  }
  if (path === "/api/v1") path = "/api";


  // -------------------- WebSocket Handler --------------------
  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط·ظ„ط¨ طھط±ظ‚ظٹط© WebSocket
  const wsResponse = handleWebSocket(request, env);
  if (wsResponse) return wsResponse;

  // ================================================================
  // ط§ظ„ظ…ط³ط§ط±ط§طھ ط§ظ„ط¹ط§ظ…ط©
  // ================================================================

  // ظپط­طµ طµط­ط© ط§ظ„ط®ط¯ظ…ط©
  if (path === "/api/health") {
    return ok({ service: "Fairfood API v2.0", status: "ok", apiBase: env.PUBLIC_API_BASE }, env);
  }

  // ================================================================
  // AUTH - طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ظˆط§ظ„ط®ط±ظˆط¬
  // ================================================================

  // طھط³ط¬ظٹظ„ ظ…ط³طھط®ط¯ظ… ط¬ط¯ظٹط¯
  if ((path === "/api/auth/register" || path === "/api/v1/auth/register") && method === "POST") {
    const b = await readBody(request);
    if (!["customer", "restaurant", "driver"].includes(b.role)) return fail("Invalid role", 422, "INVALID_ROLE", env);
    if (!b.email || !b.password || !b.name) return fail("Missing registration fields", 422, "MISSING_FIELDS", env);
    const userId = uid("u");
    await env.DB.prepare("INSERT INTO users (id, role, name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, ?, ?, 'active')")
      .bind(userId, b.role, b.name, String(b.email).toLowerCase(), b.phone || null, await hashPassword(b.password)).run();
    if (b.role === "customer") await createWalletIfMissing(env, "customer", userId);
    if (b.role === "restaurant") {
      const rid = uid("r");
      // Auto-detect currency from lat/lng if provided
      let currency = 'SAR';
      if (b.lat && b.lng) {
        currency = await getCurrencyFromCoords(b.lat, b.lng);
      }
      await env.DB.prepare("INSERT INTO restaurants (id, owner_user_id, name, description, address, cuisine, status, verification_status, lat, lng, currency) VALUES (?, ?, ?, ?, ?, ?, 'open', 'approved', ?, ?, ?)")
        .bind(rid, userId, b.restaurantName || b.name, b.description || "", b.address || "Address needed", b.cuisine || "Food", b.lat || null, b.lng || null, currency).run();
      await createWalletIfMissing(env, "restaurant", rid);
      await env.DB.prepare("INSERT INTO documents (id, owner_type, owner_id, document_type, file_url, status) VALUES (?, 'restaurant', ?, 'business_license', ?, 'pending')")
        .bind(uid("doc"), rid, b.businessLicenseUrl || "").run();
    }
    if (b.role === "driver") {
      const did = uid("d");
      await env.DB.prepare("INSERT INTO drivers (id, user_id, status, vehicle, plate_number, verification_status) VALUES (?, ?, 'offline', ?, ?, 'pending')")
        .bind(did, userId, b.vehicle || "car", b.plateNumber || "").run();
      await createWalletIfMissing(env, "driver", did);
      await env.DB.prepare("INSERT INTO documents (id, owner_type, owner_id, document_type, file_url, status) VALUES (?, 'driver', ?, 'driver_license', ?, 'pending')")
        .bind(uid("doc"), did, b.driverLicenseUrl || "").run();
    }
    const user = await env.DB.prepare("SELECT id, role, name, email, phone FROM users WHERE id=?").bind(userId).first();
    await audit(env, user, "auth.register", "user", userId, request);
    return ok({ user, token: await signJwt({ sub: user.id, role: user.role }, env) }, env, 201);
  }

  // طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„
  if ((path === "/api/auth/login" || path === "/api/v1/auth/login") && method === "POST") {
    const b = await readBody(request);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(String(b.email || "").toLowerCase()).first();
    if (!user || !(await verifyPassword(b.password || "", user.password_hash))) return fail("Invalid login", 401, "INVALID_LOGIN", env);
    if (user.status !== "active") return fail("Account not active", 403, "ACCOUNT_NOT_ACTIVE", env);
    const safe = { id: user.id, role: user.role, name: user.name, email: user.email, phone: user.phone };
    await audit(env, safe, "auth.login", "user", user.id, request);
    return ok({ user: safe, token: await signJwt({ sub: user.id, role: user.role }, env) }, env);
  }

  // ط¯ط®ظˆظ„ ظƒط²ط§ط¦ط±
  if ((path === "/api/auth/guest" || path === "/api/v1/auth/guest") && method === "POST") {
    const guestId = uid("guest");
    const token = await signJwt({ sub: guestId, role: "customer", guest: true }, env);
    return ok({ token, user: { id: guestId, role: "customer", name: "ط²ط§ط¦ط±", guest: true } }, env);
  }

  // طھط¬ط¯ظٹط¯ ط§ظ„طھظˆظƒظ†
  if ((path === "/api/auth/refresh" || path === "/api/v1/auth/refresh") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    return ok({ token: await signJwt({ sub: a.user.id, role: a.user.role }, env) }, env);
  }

  // ظ…ط¹ظ„ظˆظ…ط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ط­ط§ظ„ظٹ
  if ((path === "/api/auth/me" || path === "/api/v1/auth/me") && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    return ok({ user: a.user }, env);
  }

  // طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„طھظˆظƒظ† (ظ„ظ„طھط·ط¨ظٹظ‚ط§طھ)
  if (path === "/api/auth/verify" && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    return ok({ valid: true, user: a.user }, env);
  }

  // ================================================================
  // PROFILE - ط§ظ„ظ…ظ„ظپ ط§ظ„ط´ط®طµظٹ
  // ================================================================

  // ط¬ظ„ط¨ ط§ظ„ظ…ظ„ظپ ط§ظ„ط´ط®طµظٹ
  if ((path === "/api/profile/me" || path === "/api/v1/profile/me") && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    return ok({ data: a.user }, env);
  }

  // طھط­ط¯ظٹط« ط§ظ„ظ…ظ„ظپ ط§ظ„ط´ط®طµظٹ
  if ((path === "/api/profile/me" || path === "/api/v1/profile/me") && method === "PUT") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const b = await readBody(request);
    await env.DB.prepare("UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), avatar_url=COALESCE(?,avatar_url), updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(b.name ?? null, b.phone ?? null, b.avatarUrl ?? null, a.user.id).run();
    return ok({ message: "updated" }, env);
  }

  // ================================================================
  // ADDRESSES - ط¹ظ†ط§ظˆظٹظ† ط§ظ„ط¹ظ…ظٹظ„
  // ================================================================

  // ط¬ظ„ط¨ ط§ظ„ط¹ظ†ط§ظˆظٹظ†
  if ((path === "/api/profile/addresses" || path === "/api/v1/profile/addresses") && method === "GET") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC, created_at DESC").bind(a.user.id).all();
    return ok({ data: rows.results || [] }, env);
  }

  // ط¥ط¶ط§ظپط© ط¹ظ†ظˆط§ظ†
  if ((path === "/api/profile/addresses" || path === "/api/v1/profile/addresses") && method === "POST") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    const b = await readBody(request);
    if (!b.name || !b.details) return fail("Missing address fields", 422, "MISSING_FIELDS", env);
    const aid = uid("addr");
    await env.DB.prepare("INSERT INTO addresses (id, user_id, name, details, lat, lng) VALUES (?,?,?,?,?,?)")
      .bind(aid, a.user.id, b.name, b.details, b.lat || null, b.lng || null).run();
    return ok({ id: aid }, env, 201);
  }

  // ================================================================
  // CATEGORIES - طھطµظ†ظٹظپط§طھ ط§ظ„ظ…ط·ط§ط¹ظ…
  // ================================================================

  if ((path === "/api/categories" || path === "/api/v1/categories") && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order, name").all();
    return ok({ data: rows.results || [] }, env);
  }

  // ================================================================
  // RESTAURANTS - ط§ظ„ظ…ط·ط§ط¹ظ… (ط¹ط§ظ…ط©)
  // ================================================================

  // ظ‚ط§ط¦ظ…ط© ط§ظ„ظ…ط·ط§ط¹ظ… ط§ظ„ظ…ظپطھظˆط­ط©
  if ((path === "/api/restaurants" || path === "/api/v1/restaurants") && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM restaurants WHERE status='open' AND verification_status='approved' ORDER BY rating DESC").all();
    return ok({ data: rows.results || [] }, env);
  }

  // ط§ظ„ظ…ط·ط§ط¹ظ… ط§ظ„ظ‚ط±ظٹط¨ط© (ظ…ط¹ ظپظ„طھط±ط© ط§ظ„ظ…ط³ط§ظپط© - ط§ظپطھط±ط§ط¶ظٹ 40ظƒظ…)
  if ((path === "/api/restaurants/nearby" || path === "/api/v1/restaurants/nearby") && method === "GET") {
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const radius = Math.min(Number(url.searchParams.get("radius") || 40), 100); // max 100km

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return fail("Invalid coordinates", 422, "INVALID_COORDS", env);
    }

    // Haversine formula in SQL (SQLite)
    // AI-assisted: POWER() -> pow() for D1 compatibility (ChatGPT, OpenCode)
    // AI-assisted: subquery wrapper for HAVING-on-non-aggregate fix (ChatGPT, OpenCode)
    const rows = await env.DB.prepare(`
      SELECT * FROM (
        SELECT *,
          (6371 * 2 * ASIN(SQRT(
            pow(SIN((? - lat) * PI()/360), 2) +
            COS(lat * PI()/180) * COS(? * PI()/180) *
            pow(SIN((? - lng) * PI()/360), 2)
          ))) AS distance_km
        FROM restaurants
        WHERE status='open' AND verification_status='approved'
          AND lat IS NOT NULL AND lng IS NOT NULL
      )
      WHERE distance_km <= ?
      ORDER BY distance_km ASC
      LIMIT 50
    `).bind(lat, lat, lng, radius).all();

    return ok({ data: rows.results || [] }, env);
  }

  // ظ‚ط§ط¦ظ…ط© ظ…ظ†ظٹظˆ ظ…ط·ط¹ظ… ظ…ط¹ظٹظ†
  const publicMenu = path.match(/^\/api\/restaurants\/([^/]+)\/menu$/);
  if (publicMenu && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM menu_items WHERE restaurant_id=? AND available=1 AND (inventory_count IS NULL OR inventory_count > 0) ORDER BY category, name").bind(publicMenu[1]).all();
    return ok({ data: rows.results || [] }, env);
  }

  // ================================================================
  // COUPONS - ظƒظˆط¨ظˆظ†ط§طھ ط§ظ„ط®طµظ…
  // ================================================================

  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµظ„ط§ط­ظٹط© ط§ظ„ظƒظˆط¨ظˆظ†
  if ((path === "/api/coupons/validate" || path === "/api/v1/coupons/validate") && method === "POST") {
    const b = await readBody(request);
    const subtotal = Number(b.subtotalCents || 0);
    const c = await env.DB.prepare("SELECT * FROM coupons WHERE code=? AND active=1").bind(String(b.code || "").toUpperCase()).first();
    if (!c) return fail("Invalid coupon", 404, "INVALID_COUPON", env);
    if (subtotal < c.min_order_cents) return fail("Minimum order not reached for coupon", 422, "COUPON_MIN_ORDER", env);
    const discount = Math.min(subtotal, Math.max(Number(c.amount_off_cents || 0), Math.round(subtotal * Number(c.percent_off || 0) / 100)));
    return ok({ coupon: c, discountCents: discount }, env);
  }

  // ================================================================
  // ORDERS - ط§ظ„ط·ظ„ط¨ط§طھ
  // ================================================================

  // ط­ط³ط§ط¨ ط¹ط±ط¶ ط³ط¹ط± ظ„ظ„ط·ظ„ط¨
  if ((path === "/api/orders/quote" || path === "/api/v1/orders/quote") && method === "POST") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    const b = await readBody(request);
    if (!b.restaurant_id || !Array.isArray(b.items) || !b.items.length) return fail("Missing order data", 422, "INVALID_ORDER", env);
    const restaurant = await env.DB.prepare("SELECT * FROM restaurants WHERE id=? AND status='open' AND verification_status='approved'").bind(b.restaurant_id).first();
    if (!restaurant) return fail("Restaurant not available", 422, "RESTAURANT_CLOSED", env);
    let subtotal = 0;
    for (const it of b.items) {
      const m = await env.DB.prepare("SELECT * FROM menu_items WHERE id=? AND restaurant_id=? AND available=1").bind(it.menu_item_id, restaurant.id).first();
      if (!m) return fail("Item unavailable: " + it.menu_item_id, 422, "ITEM_UNAVAILABLE", env);
      subtotal += Number(it.quantity || 1) * m.price_cents;
    }
    const delivery = restaurant.delivery_fee_cents || 0;
    const service = 0; // ظٹظ…ظƒظ† ط¥ط¶ط§ظپط© ط±ط³ظˆظ… ط®ط¯ظ…ط© ظ„ط§ط­ظ‚ظ‹ط§
    const total = subtotal + delivery + service;
    return ok({ data: { subtotal, delivery_fee: delivery, service_fee: service, total, quoteId: uid("q") } }, env);
  }

  // ط¥ظ†ط´ط§ط، ط·ظ„ط¨ ط¬ط¯ظٹط¯
  if ((path === "/api/orders" || path === "/api/v1/orders") && method === "POST") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    const b = await readBody(request);
    if (!b.restaurant_id || !Array.isArray(b.items) || !b.items.length) return fail("Missing order data", 422, "INVALID_ORDER", env);
    const restaurant = await env.DB.prepare("SELECT * FROM restaurants WHERE id=? AND status='open' AND verification_status='approved'").bind(b.restaurant_id).first();
    if (!restaurant) return fail("Restaurant is closed", 422, "RESTAURANT_CLOSED", env);
    let subtotal = 0;
    const prepared = [];
    for (const it of b.items) {
      const m = await env.DB.prepare("SELECT * FROM menu_items WHERE id=? AND restaurant_id=? AND available=1").bind(it.menu_item_id, restaurant.id).first();
      if (!m) return fail("Item unavailable", 422, "ITEM_UNAVAILABLE", env);
      const qty = Math.max(1, Number(it.quantity || 1));
      if (m.inventory_count !== null && Number(m.inventory_count) < qty) return fail("Item out of stock", 422, "OUT_OF_STOCK", env);
      const total = qty * m.price_cents;
      subtotal += total;
      prepared.push({ m, qty, total });
    }
    if (subtotal < restaurant.min_order_cents) return fail("Minimum order not reached", 422, "MIN_ORDER", env);
    let discount = 0, couponCode = null;
    if (b.coupon_code) {
      const c = await env.DB.prepare("SELECT * FROM coupons WHERE code=? AND active=1").bind(String(b.coupon_code).toUpperCase()).first();
      if (c && subtotal >= c.min_order_cents) {
        discount = Math.min(subtotal, Math.max(Number(c.amount_off_cents || 0), Math.round(subtotal * Number(c.percent_off || 0) / 100)));
        couponCode = c.code;
      }
    }
    const orderId = uid("o");
    const total = Math.max(0, subtotal + restaurant.delivery_fee_cents - discount);
    // ط§ط®طھظٹط§ط± ط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹: ط¥ط°ط§ ظƒط§ظ†طھ StripeطŒ ظ†ظ†طھط¸ط± طھط£ظƒظٹط¯ ط§ظ„ط¯ظپط¹
    const paymentMethod = b.payment_method || "cash";
    const paymentStatus = paymentMethod === "cash" ? "pending" : (paymentMethod === "stripe" ? "pending" : "pending");
    await env.DB.prepare("INSERT INTO orders (id, customer_user_id, restaurant_id, customer_name, customer_phone, delivery_address, delivery_note, subtotal_cents, delivery_fee_cents, discount_cents, total_cents, payment_method, payment_status, coupon_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(orderId, a.user.id, restaurant.id, a.user.name, a.user.phone, b.delivery_address || "", b.delivery_note || b.notes || "", subtotal, restaurant.delivery_fee_cents, discount, total, paymentMethod, paymentStatus, couponCode).run();
    for (const item of prepared) {
      await env.DB.prepare("INSERT INTO order_items (id, order_id, menu_item_id, name, quantity, unit_price_cents, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(uid("oi"), orderId, item.m.id, item.m.name, item.qty, item.m.price_cents, item.total).run();
      if (item.m.inventory_count !== null) {
        await env.DB.prepare("UPDATE menu_items SET inventory_count=inventory_count-? WHERE id=?").bind(item.qty, item.m.id).run();
      }
    }
    await addEvent(env, orderId, a.user.id, "order.created", "ط·ظ„ط¨ ط¬ط¯ظٹط¯ ظˆطµظ„ ظ„ظ„ظ…ط·ط¹ظ…");
    await notify(env, restaurant.owner_user_id, "ط·ظ„ط¨ ط¬ط¯ظٹط¯", "ظ„ط¯ظٹظƒ ط·ظ„ط¨ ط¬ط¯ظٹط¯ ظٹط­طھط§ط¬ ظ‚ط¨ظˆظ„ ط£ظˆ ط±ظپط¶.");
    // ط¨ط« ظ„ظ„ظ€ WebSocket
    broadcastToRestaurants("order:new", { orderId, restaurant_id: restaurant.id });
    await audit(env, a.user, "order.create", "order", orderId, request);
    const order = await getOrder(env, orderId);
    return ok({ data: order || { id: orderId } }, env, 201);
  }

  // ط·ظ„ط¨ط§طھظٹ (ظ„ظ„ط¹ظ…ظٹظ„)
  if ((path === "/api/orders/my" || path === "/api/v1/orders/my") && method === "GET") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.customer_user_id=? ORDER BY o.created_at DESC LIMIT 50").bind(a.user.id).all();
    return ok({ data: rows.results || [] }, env);
  }

  // ================================================================
  // RESTAURANT PRIVATE - ظ„ظˆط­ط© ط§ظ„ظ…ط·ط¹ظ…
  // ================================================================

  // ظ…ط¹ظ„ظˆظ…ط§طھ ط§ظ„ظ…ط·ط¹ظ… ظ„ظ„ظ…ط§ظ„ظƒ
  if ((path === "/api/restaurant/me" || path === "/api/v1/restaurant/me") && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const restaurant = await env.DB.prepare("SELECT * FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    if (!restaurant) return fail("Restaurant not found", 404, "NOT_FOUND", env);
    return ok({ data: { restaurant } }, env);
  }

  // طھط­ط¯ظٹط« ط§ظ„ظ…ط·ط¹ظ…
  const restaurantUpdate = path.match(/^\/api\/restaurant\/([^/]+)$/);
  if (restaurantUpdate && method === "PUT") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const b = await readBody(request);
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    if (!r || r.id !== restaurantUpdate[1]) return fail("Forbidden", 403, "FORBIDDEN", env);

    // Currency: manual choice beats auto-detect
    let currency = b.currency || null;
    if (!currency && b.lat && b.lng) {
      currency = await getCurrencyFromCoords(b.lat, b.lng);
    }

    await env.DB.prepare("UPDATE restaurants SET name=COALESCE(?,name), phone=COALESCE(?,phone), address=COALESCE(?,address), description=COALESCE(?,description), cuisine=COALESCE(?,cuisine), is_open=COALESCE(?,is_open), opening_time=COALESCE(?,opening_time), closing_time=COALESCE(?,closing_time), lat=COALESCE(?,lat), lng=COALESCE(?,lng), currency=COALESCE(?,currency), delivery_fee_cents=COALESCE(?,delivery_fee_cents), min_order_cents=COALESCE(?,min_order_cents), delivery_time_min=COALESCE(?,delivery_time_min), delivery_time_max=COALESCE(?,delivery_time_max), status=CASE WHEN ?=1 THEN 'open' WHEN ?=0 THEN 'closed' ELSE status END, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(b.name ?? null, b.phone ?? null, b.address ?? null, b.description ?? null, b.cuisine ?? null, b.isOpen === undefined ? null : (b.isOpen ? 1 : 0), b.openingTime ?? null, b.closingTime ?? null, b.lat ?? null, b.lng ?? null, currency, b.deliveryFeeCents ?? null, b.minOrderCents ?? null, b.deliveryTimeMin ?? null, b.deliveryTimeMax ?? null, b.isOpen === undefined ? null : (b.isOpen ? 1 : 0), b.isOpen === undefined ? null : (b.isOpen ? 0 : 1), r.id).run();
    return ok({ message: "updated" }, env);
  }

  // ط§ظ„ظ…ظ„ظپ ط§ظ„ط´ط®طµظٹ ظ„ظ„ظ…ط·ط¹ظ… (ظ„ظ„طھظˆط§ظپظ‚ ظ…ط¹ ط§ظ„ط¥طµط¯ط§ط± ط§ظ„ظ‚ط¯ظٹظ…)
  if ((path === "/api/restaurant/profile" || path === "/api/v1/restaurant/profile") && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const restaurant = await env.DB.prepare("SELECT * FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    return ok({ restaurant }, env);
  }

  // ظ‚ط§ط¦ظ…ط© ظ…ظ†ظٹظˆ ط§ظ„ظ…ط·ط¹ظ… (ظ„ظ„ظ…ط·ط¹ظ… ظ†ظپط³ظ‡)
  if ((path === "/api/restaurant/menu" || path === "/api/v1/restaurant/menu") && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    if (!r) return fail("Restaurant not found", 404, "NOT_FOUND", env);
    const items = await env.DB.prepare("SELECT * FROM menu_items WHERE restaurant_id=? ORDER BY category, name").bind(r.id).all();
    const categories = await env.DB.prepare("SELECT DISTINCT category_id, category FROM menu_items WHERE restaurant_id=? AND category IS NOT NULL ORDER BY category").bind(r.id).all();
    return ok({ items: items.results || [], categories: categories.results || [] }, env);
  }

  // ط¥ط¶ط§ظپط© طµظ†ظپ ظ„ظ„ظ…ظ†ظٹظˆ (ظ„ظ„ظ…ط·ط¹ظ…)
  // ط¥ط¶ط§ظپط© طµظ†ظپ ظ„ظ„ظ…ظ†ظٹظˆ (ظ„ظ„ظ…ط·ط¹ظ…)
  if ((path === "/api/restaurant/menu" || path === "/api/v1/restaurant/menu") && method === "POST") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const { b, imgBuf, imgType } = await parseMenuBody(request);
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    if (!r) return fail("Restaurant not found", 404, "NOT_FOUND", env);
    const itemId = uid("m");
    const key = imgBuf ? `menu/${itemId}.${imgType.split('/')[1] || 'png'}` : null;
    const imageUrl = imgBuf ? await uploadFile(env, key, imgBuf, imgType) : (b.image || "");
    const priceCents = Math.round(Number(b.priceCents ?? (b.price != null ? b.price * 100 : 0)));
    await env.DB.prepare("INSERT INTO menu_items (id, restaurant_id, category, category_id, name, description, price_cents, image, tags, available, inventory_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(itemId, r.id, b.category || "Main", b.categoryId || b.category || "", b.name || "Item", b.description || "", priceCents, imageUrl, b.tags || "", b.available === false ? 0 : 1, b.inventoryCount ?? null).run();
    return ok({ id: itemId }, env, 201);
  }

  // طھط¹ط¯ظٹظ„ ط£ظˆ ط­ط°ظپ طµظ†ظپ ظپظٹ ط§ظ„ظ…ظ†ظٹظˆ
  const restaurantItem = path.match(/^\/api\/restaurant\/menu\/([^/]+)$/);
  if (restaurantItem && ["PATCH", "PUT", "DELETE"].includes(method)) {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    if (!r) return fail("Restaurant not found", 404, "NOT_FOUND", env);
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM menu_items WHERE id=? AND restaurant_id=?").bind(restaurantItem[1], r.id).run();
      return ok({ message: "deleted" }, env);
    }
    const { b, imgBuf, imgType } = await parseMenuBody(request);
    const key = imgBuf ? `menu/${restaurantItem[1]}.${imgType.split('/')[1] || 'png'}` : null;
    const imageUrl = imgBuf ? await uploadFile(env, key, imgBuf, imgType) : (b.image || b.imageUrl || null);
    const rawPrice = b.priceCents != null ? b.priceCents : (b.price != null ? b.price * 100 : null);
    const priceCents = rawPrice != null ? Math.round(Number(rawPrice)) : null;
    await env.DB.prepare("UPDATE menu_items SET category=COALESCE(?,category), category_id=COALESCE(?,category_id), name=COALESCE(?,name), description=COALESCE(?,description), price_cents=COALESCE(?,price_cents), image=COALESCE(?,image), tags=COALESCE(?,tags), available=COALESCE(?,available), inventory_count=COALESCE(?,inventory_count), sort_order=COALESCE(?,sort_order), updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?")
      .bind(b.category ?? null, b.categoryId ?? b.category ?? null, b.name ?? null, b.description ?? null, priceCents, imageUrl, b.tags ?? null, b.available === undefined ? null : (b.available ? 1 : 0), b.inventoryCount ?? null, b.sortOrder ?? null, restaurantItem[1], r.id).run();
    return ok({ message: "updated" }, env);
  }

  // ظ…ظ†ظٹظˆ ط§ظ„ظ…ط·ط¹ظ… ظ…ط¹ restaurantId (ظ„ظ„طھط·ط¨ظٹظ‚ ط§ظ„ط¬ط¯ظٹط¯)
  const restaurantMenuById = path.match(/^\/api\/restaurant\/([^/]+)\/menu$/);
  if (restaurantMenuById && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const rId = restaurantMenuById[1];
    // طھط­ظ‚ظ‚ ط£ظ† ط§ظ„ظ…ط·ط¹ظ… ظٹط®طµ ط§ظ„ظ…ط³طھط®ط¯ظ…
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE id=? AND owner_user_id=?").bind(rId, a.user.id).first();
    if (!r) return fail("Forbidden", 403, "FORBIDDEN", env);
    const items = await env.DB.prepare("SELECT * FROM menu_items WHERE restaurant_id=? ORDER BY category, name").bind(rId).all();
    const categories = await env.DB.prepare("SELECT DISTINCT category_id, category FROM menu_items WHERE restaurant_id=? AND category IS NOT NULL ORDER BY category").bind(rId).all();
    return ok({ data: items.results || [], items: items.results || [], categories: categories.results || [] }, env);
  }

  // ط¥ط¶ط§ظپط© طµظ†ظپ ظ„ظ„ظ…ظ†ظٹظˆ (ط¨ظ€ restaurantId)
  if (restaurantMenuById && method === "POST") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const rId = restaurantMenuById[1];
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE id=? AND owner_user_id=?").bind(rId, a.user.id).first();
    if (!r) return fail("Forbidden", 403, "FORBIDDEN", env);
    const { b, imgBuf, imgType } = await parseMenuBody(request);
    const itemId = uid("m");
    const key = imgBuf ? `menu/${itemId}.${imgType.split('/')[1] || 'png'}` : null;
    const imageUrl = imgBuf ? await uploadFile(env, key, imgBuf, imgType) : (b.image || b.imageUrl || "");
    const priceCents = Math.round(Number(b.priceCents ?? (b.price != null ? b.price * 100 : 0)));
    await env.DB.prepare("INSERT INTO menu_items (id, restaurant_id, category, category_id, name, description, price_cents, image, tags, available, inventory_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(itemId, rId, b.category || "Main", b.categoryId || b.category || "", b.name || "Item", b.description || "", priceCents, imageUrl, b.tags || "", b.available === false ? 0 : 1, b.inventoryCount ?? null).run();
    return ok({ id: itemId }, env, 201);
  }

  // ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط·ط¹ظ…
  if ((path === "/api/restaurant/orders" || path === "/api/v1/restaurant/orders") && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
    if (!r) return fail("Restaurant not found", 404, "NOT_FOUND", env);
    const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.restaurant_id=? ORDER BY o.created_at DESC LIMIT 200").bind(r.id).all();
    const orders = (rows.results || []).map(o => ({ ...o, total: o.total_cents }));
    const orderIds = orders.map(o => o.id);
    if (orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');
      const items = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`).bind(...orderIds).all();
      const itemMap = {};
      (items.results || []).forEach(it => {
        if (!itemMap[it.order_id]) itemMap[it.order_id] = [];
        itemMap[it.order_id].push(it);
      });
      orders.forEach(o => { o.items = itemMap[o.id] || []; });
    }
    return ok({ data: orders, orders }, env);
  }

  // ط·ظ„ط¨ط§طھ ط§ظ„ظ…ط·ط¹ظ… (ط¨ظ€ restaurantId)
  const restaurantOrdersById = path.match(/^\/(?:api\/v1|api)\/restaurant\/([^/]+)\/orders$/);
  if (restaurantOrdersById && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const rId = restaurantOrdersById[1];
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE id=? AND owner_user_id=?").bind(rId, a.user.id).first();
    if (!r) return fail("Forbidden", 403, "FORBIDDEN", env);
    const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.restaurant_id=? ORDER BY o.created_at DESC LIMIT 200").bind(rId).all();
    const orders = (rows.results || []).map(o => ({ ...o, total: o.total_cents }));
    const orderIds = orders.map(o => o.id);
    if (orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');
      const items = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`).bind(...orderIds).all();
      const itemMap = {};
      (items.results || []).forEach(it => { if (!itemMap[it.order_id]) itemMap[it.order_id] = []; itemMap[it.order_id].push(it); });
      orders.forEach(o => { o.items = itemMap[o.id] || []; });
    }
    return ok({ data: orders, orders }, env);
  }

  // ط£ط±ط¨ط§ط­ ط§ظ„ظ…ط·ط¹ظ…
  const restaurantEarnings = path.match(/^\/api\/restaurant\/([^/]+)\/earnings$/);
  if (restaurantEarnings && method === "GET") {
    const a = await requireAuth(request, env, "restaurant");
    if (a.error) return a.error;
    const rId = restaurantEarnings[1];
    const r = await env.DB.prepare("SELECT id FROM restaurants WHERE id=? AND owner_user_id=?").bind(rId, a.user.id).first();
    if (!r) return fail("Forbidden", 403, "FORBIDDEN", env);
    const total = await env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total FROM orders WHERE restaurant_id=? AND status='completed'").bind(rId).first();
    const today = await env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total FROM orders WHERE restaurant_id=? AND status='completed' AND date(created_at)=date('now')").bind(rId).first();
    const week = await env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total FROM orders WHERE restaurant_id=? AND status='completed' AND created_at >= datetime('now', '-7 days')").bind(rId).first();
    const wallet = await env.DB.prepare("SELECT balance_cents, pending_cents FROM wallets WHERE owner_type='restaurant' AND owner_id=?").bind(rId).first();
    return ok({ data: { total: total?.total || 0, today: today?.total || 0, week: week?.total || 0, commission: Math.round((total?.total || 0) * 0.12), wallet: wallet || { balance_cents: 0, pending_cents: 0 } } }, env);
  }

  // ================================================================
  // DRIVER PRIVATE - ظ„ظˆط­ط© ط§ظ„ط³ط§ط¦ظ‚
  // ================================================================

  // ط¯ط®ظˆظ„ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/auth/login" || path === "/api/v1/driver/auth/login") && method === "POST") {
    const b = await readBody(request);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=? AND role='driver'").bind(String(b.email || "").toLowerCase()).first();
    if (!user || !(await verifyPassword(b.password || "", user.password_hash))) return fail("Invalid login", 401, "INVALID_LOGIN", env);
    if (user.status !== "active") return fail("Account not active", 403, "ACCOUNT_NOT_ACTIVE", env);
    const d = await env.DB.prepare("SELECT * FROM drivers WHERE user_id=?").bind(user.id).first();
    await audit(env, { id: user.id }, "driver.login", "user", user.id, request);
    const loginDriverData = d || {};
    return ok({ token: await signJwt({ sub: user.id, role: "driver" }, env), user: { ...user, driver: loginDriverData, vehicle_plate: loginDriverData.plate_number || "", vehicle_model: loginDriverData.vehicle_model || "", rating: loginDriverData.rating || 0, total_deliveries: loginDriverData.total_deliveries || 0, today_earnings: 0, weekly_earnings: 0, monthly_earnings: 0, password_hash: undefined } }, env);
  }

  // ظ…ظ„ظپ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/profile" || path === "/api/v1/driver/profile") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT * FROM drivers WHERE user_id=?").bind(a.user.id).first();
    const driverData = d || {};
    return ok({ data: { ...a.user, driver: driverData, vehicle_plate: driverData.plate_number || "", vehicle_model: driverData.vehicle_model || "", rating: driverData.rating || 0, total_deliveries: driverData.total_deliveries || 0, today_earnings: driverData.today_earnings || 0, weekly_earnings: driverData.weekly_earnings || 0, monthly_earnings: driverData.monthly_earnings || 0 } }, env);
  }

  // طھط؛ظٹظٹط± ط­ط§ظ„ط© ط§ظ„ط³ط§ط¦ظ‚ (ظ…طھطµظ„/ط؛ظٹط± ظ…طھطµظ„)
  if ((path === "/api/driver/status" || path === "/api/v1/driver/status") && method === "POST") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const b = await readBody(request);
    const status = b.online ? "online" : "offline";
    await env.DB.prepare("UPDATE drivers SET status=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(status, a.user.id).run();
    return ok({ status }, env);
  }

  // طھط´ط؛ظٹظ„/ط¥ظٹظ‚ط§ظپ ط§ظ„ط³ط§ط¦ظ‚ (ظ„ظ„طھظˆط§ظپظ‚ ظ…ط¹ ط§ظ„طھط·ط¨ظٹظ‚ ط§ظ„ط¬ط¯ظٹط¯)
  if ((path === "/api/driver/online" || path === "/api/v1/driver/online") && method === "POST") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    await env.DB.prepare("UPDATE drivers SET status='online', updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(a.user.id).run();
    return ok({ status: "online" }, env);
  }
  if ((path === "/api/driver/offline" || path === "/api/v1/driver/offline") && method === "POST") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    await env.DB.prepare("UPDATE drivers SET status='offline', updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(a.user.id).run();
    return ok({ status: "offline" }, env);
  }

  // طھط­ط¯ظٹط« ظ…ظˆظ‚ط¹ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/location" || path === "/api/v1/driver/location") && method === "POST") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const b = await readBody(request);
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail("Invalid location", 422, "INVALID_LOCATION", env);
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    await env.DB.batch([
      env.DB.prepare("UPDATE drivers SET lat=?, lng=?, last_location_at=CURRENT_TIMESTAMP WHERE id=?").bind(lat, lng, d.id),
      env.DB.prepare("INSERT INTO driver_locations (id,driver_id,order_id,lat,lng,accuracy) VALUES (?,?,?,?,?,?)").bind(uid("dl"), d.id, b.orderId || null, lat, lng, b.accuracy || null)
    ]);
    // ط¨ط« ظ…ظˆظ‚ط¹ ط§ظ„ط³ط§ط¦ظ‚ ظ„ظ„ظ…ط´طھط±ظƒظٹظ† ظپظٹ ط§ظ„ط·ظ„ط¨
    if (b.orderId) {
      broadcastToOrder(b.orderId, "driver:location", { lat, lng, accuracy: b.accuracy });
    }
    return ok({ location: { lat, lng } }, env);
  }

  // ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…طھط§ط­ط© ظ„ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/orders/available" || path === "/api/v1/driver/orders/available" || path === "/api/driver/orders/new") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name, r.address AS restaurant_address, r.lat AS restaurant_lat, r.lng AS restaurant_lng FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.status='ready_for_driver' AND o.driver_id IS NULL ORDER BY o.updated_at ASC LIMIT 50").all();
    const orders = (rows.results || []).map(o => ({ ...o, estimated_earning: o.delivery_fee_cents || 0, destination_lat: o.restaurant_lat, destination_lng: o.restaurant_lng }));
    return ok({ data: orders, orders: orders }, env);
  }

  // ط·ظ„ط¨ظٹط§طھ ط§ظ„ط³ط§ط¦ظ‚ ط§ظ„ط­ط§ظ„ظٹط©
  if ((path === "/api/driver/orders/current" || path === "/api/v1/driver/orders/current") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return ok({ data: [] }, env);
    const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name, r.address AS restaurant_address, r.lat AS restaurant_lat, r.lng AS restaurant_lng FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.driver_id=? AND o.status NOT IN ('completed','cancelled') ORDER BY o.updated_at DESC").bind(d.id).all();
    return ok({ data: rows.results || [], orders: rows.results || [] }, env);
  }

  // ط³ط¬ظ„ ط·ظ„ط¨ط§طھ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/orders/history" || path === "/api/v1/driver/orders/history") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return ok({ data: [] }, env);
    const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.driver_id=? AND o.status IN ('completed','cancelled') ORDER BY o.updated_at DESC LIMIT 50").bind(d.id).all();
    return ok({ data: rows.results || [] }, env);
  }

  // ط£ط±ط¨ط§ط­ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/earnings" || path === "/api/v1/driver/earnings") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT * FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    const today = await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND date(o.updated_at)=date('now')").bind(d.id).first();
    const week = await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND o.updated_at >= datetime('now', '-7 days')").bind(d.id).first();
    const month = await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND o.updated_at >= datetime('now', '-30 days')").bind(d.id).first();
    const totalDeliveries = await env.DB.prepare("SELECT COUNT(*) count FROM orders WHERE driver_id=? AND status='completed'").bind(d.id).first();
    return ok({ data: { today_earnings: today?.total || 0, weekly_earnings: week?.total || 0, monthly_earnings: month?.total || 0, total_deliveries: totalDeliveries?.count || 0, today_deliveries: 0 } }, env);
  }

  // ظ…ط­ظپط¸ط© ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/wallet" || path === "/api/v1/driver/wallet") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    const wid = await createWalletIfMissing(env, "driver", d.id);
    const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id=?").bind(wid).first();
    const w = wallet || { balance_cents: 0, pending_cents: 0 };
    w.balance = Math.round((w.balance_cents || 0) / 100);
    return ok({ data: w }, env);
  }

  // ط­ط±ظƒط§طھ ط§ظ„ظ…ط­ظپط¸ط©
  if ((path === "/api/driver/wallet/transactions" || path === "/api/v1/driver/wallet/transactions") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    const wid = await createWalletIfMissing(env, "driver", d.id);
    const tx = await env.DB.prepare("SELECT * FROM wallet_transactions WHERE wallet_id=? ORDER BY created_at DESC LIMIT 50").bind(wid).all();
    const txData = (tx.results || []).map(t => ({ ...t, amount: Math.round((t.amount_cents || 0) / 100) }));
    return ok({ data: txData }, env);
  }

  // ط·ظ„ط¨ ط³ط­ط¨ ظ…ظ† ط§ظ„ظ…ط­ظپط¸ط©
  if ((path === "/api/driver/wallet/withdraw" || path === "/api/v1/driver/wallet/withdraw") && method === "POST") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    const wid = await createWalletIfMissing(env, "driver", d.id);
    const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id=?").bind(wid).first();
    if (!wallet || wallet.balance_cents <= 0) return fail("Insufficient balance", 422, "INSUFFICIENT_BALANCE", env);
    const amount = wallet.balance_cents;
    await env.DB.batch([
      env.DB.prepare("UPDATE wallets SET balance_cents=0, pending_cents=pending_cents+? WHERE id=?").bind(amount, wid),
      env.DB.prepare("INSERT INTO wallet_transactions (id,wallet_id,type,amount_cents,note) VALUES (?,?,?,?,?)").bind(uid("wt"), wid, "debit", amount, "ط·ظ„ط¨ ط³ط­ط¨")
    ]);
    return ok({ message: "withdrawal requested" }, env);
  }

  // ظ…ط³طھظ†ط¯ط§طھ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/documents" || path === "/api/v1/driver/documents") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return ok({ data: [] }, env);
    const docs = await env.DB.prepare("SELECT * FROM documents WHERE owner_type='driver' AND owner_id=? ORDER BY created_at DESC").bind(d.id).all();
    return ok({ data: docs.results || [] }, env);
  }

  // ظ…ط¹ظ„ظˆظ…ط§طھ ظ…ط±ظƒط¨ط© ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/vehicle" || path === "/api/v1/driver/vehicle") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT vehicle, plate_number, vehicle_model FROM drivers WHERE user_id=?").bind(a.user.id).first();
    return ok({ data: d || {} }, env);
  }

  // ط¥ط´ط¹ط§ط±ط§طھ ط§ظ„ط³ط§ط¦ظ‚
  if ((path === "/api/driver/notifications" || path === "/api/v1/driver/notifications") && method === "GET") {
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(a.user.id).all();
    return ok({ data: rows.results || [] }, env);
  }

  // ================================================================
  // ORDER ACTIONS - ط¥ط¬ط±ط§ط،ط§طھ ط§ظ„ط·ظ„ط¨ (ظ‚ط¨ظˆظ„طŒ ط±ظپط¶طŒ طھط¬ظ‡ظٹط²طŒ طھظˆطµظٹظ„)
  // ================================================================

  const action = path.match(/^\/(?:api\/v1|api)\/orders\/([^/]+)\/([^/]+)$/);
  if (action && method === "POST") {
    const [, orderId, act] = action;
    const authResult = await requireAuth(request, env);
    if (authResult.error) return authResult.error;
    const a = authResult;
    const b = await readBody(request);
    const order = await getOrder(env, orderId);
    if (!order) return fail("Order not found", 404, "NOT_FOUND", env);

    // ط§ظ„ظ…ط·ط¹ظ… ظٹظ‚ط¨ظ„ ط§ظ„ط·ظ„ط¨
    if (act === "restaurant-accept" || act === "accept") {
      if (a.user.role !== "restaurant" || order.owner_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
      const prep = Math.max(5, Number(b.prepTime || b.prepTimeMin || 25));
      await env.DB.prepare("UPDATE orders SET status='accepted_by_restaurant', prep_time_min=?, restaurant_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(prep, b.note || b.restaurant_note || "", orderId).run();
      await addEvent(env, orderId, a.user.id, "restaurant.accepted", `ط§ظ„ظ…ط·ط¹ظ… ظ‚ط¨ظ„ ط§ظ„ط·ظ„ط¨ - ظˆظ‚طھ ط§ظ„طھط¬ظ‡ظٹط² ${prep} ط¯ظ‚ظٹظ‚ط©`);
      await notify(env, order.customer_user_id, "طھظ… ظ‚ط¨ظˆظ„ ط§ظ„ط·ظ„ط¨", `ط§ظ„ظ…ط·ط¹ظ… ظ‚ط¨ظ„ ط·ظ„ط¨ظƒ. ظˆظ‚طھ ط§ظ„طھط¬ظ‡ظٹط² ${prep} ط¯ظ‚ظٹظ‚ط©.`);
      broadcastToOrder(orderId, "order:status", { status: "accepted_by_restaurant", prep_time_min: prep });
      return ok({ message: "accepted" }, env);
    }

    // ط§ظ„ظ…ط·ط¹ظ… ظٹط±ظپط¶ ط§ظ„ط·ظ„ط¨
    if (act === "restaurant-reject" || act === "reject") {
      if (a.user.role !== "restaurant" || order.owner_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
      await env.DB.prepare("UPDATE orders SET status='rejected_by_restaurant', cancel_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.reason || "Rejected", orderId).run();
      await addEvent(env, orderId, a.user.id, "restaurant.rejected", b.reason || "ط±ظپط¶ ط§ظ„ظ…ط·ط¹ظ… ط§ظ„ط·ظ„ط¨");
      await notify(env, order.customer_user_id, "طھظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨", "ط§ظ„ظ…ط·ط¹ظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨.");
      broadcastToOrder(orderId, "order:status", { status: "rejected_by_restaurant" });
      return ok({ message: "rejected" }, env);
    }

    // ط¬ط§ط±ظٹ ط§ظ„طھط­ط¶ظٹط±
    if (act === "preparing") {
      if (a.user.role !== "restaurant" || order.owner_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
      await env.DB.prepare("UPDATE orders SET status='preparing', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId).run();
      await addEvent(env, orderId, a.user.id, "restaurant.preparing", "ط¬ط§ط±ظٹ طھط­ط¶ظٹط± ط§ظ„ط·ظ„ط¨");
      broadcastToOrder(orderId, "order:status", { status: "preparing" });
      return ok({ message: "preparing" }, env);
    }

    // ط§ظ„ط·ظ„ط¨ ط¬ط§ظ‡ط² (ظٹظڈطھط§ط­ ظ„ظ„ط³ط§ط¦ظ‚ظٹظ† ظ„ط§ط®طھظٹط§ط±ظ‡)
    if (act === "ready") {
      if (a.user.role !== "restaurant" || order.owner_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
      await env.DB.prepare("UPDATE orders SET status='ready_for_driver', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId).run();
      await addEvent(env, orderId, a.user.id, "restaurant.ready", "ط§ظ„ط·ظ„ط¨ ط¬ط§ظ‡ط² ظ„ظ„ط³ط§ط¦ظ‚");
      await notify(env, order.customer_user_id, "ط§ظ„ط·ظ„ط¨ ط¬ط§ظ‡ط²", "ط§ظ„ط·ظ„ط¨ ط¬ط§ظ‡ط² ظˆظ†ط¨ط­ط« ط¹ظ† ط³ط§ط¦ظ‚.");
      broadcastToOrder(orderId, "order:status", { status: "ready_for_driver" });
      broadcastToDrivers("driver:new_order", { orderId, restaurant_name: order.restaurant_name, delivery_address: order.delivery_address });
      return ok({ message: "ready" }, env);
    }

    // ط§ظ„ط³ط§ط¦ظ‚ ظٹظ‚ط¨ظ„ ط§ظ„ط·ظ„ط¨
    if (act === "driver-accept") {
      if (a.user.role !== "driver") return fail("Driver role required", 403, "FORBIDDEN", env);
      const driverUserId = a.user.id ?? a.user.sub;
      const d = await env.DB.prepare("SELECT * FROM drivers WHERE user_id=?").bind(driverUserId).first();
      if (!d || d.status !== "online" || d.verification_status !== "approved") return fail("Driver must be online and approved", 409, "DRIVER_NOT_ONLINE", env);
      // Atomic conditional claim: only assign if order is still ready_for_driver and unassigned
      const res = await env.DB.prepare("UPDATE orders SET status='accepted_by_driver', driver_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ready_for_driver' AND driver_id IS NULL").bind(d.id, orderId).run();
      if (!res.meta.changes) return fail("Order not available or already claimed", 409, "ALREADY_CLAIMED", env);
      await env.DB.prepare("UPDATE drivers SET status='busy' WHERE id=?").bind(d.id).run();
      await addEvent(env, orderId, a.user.id, "driver.accepted", "ط§ظ„ط³ط§ط¦ظ‚ ظ‚ط¨ظ„ ط§ظ„طھظˆطµظٹظ„");
      await notify(env, order.customer_user_id, "ط§ظ„ط³ط§ط¦ظ‚ ظ‚ط¨ظ„ ط§ظ„ط·ظ„ط¨", "ط§ظ„ط³ط§ط¦ظ‚ ظپظٹ ط·ط±ظٹظ‚ظ‡ ظ„ظ„ظ…ط·ط¹ظ….");
      broadcastToOrder(orderId, "order:status", { status: "accepted_by_driver", driver_id: d.id });
      return ok({ message: "driver accepted" }, env);
    }

    // ط§ظ„ط³ط§ط¦ظ‚ ط§ط³طھظ„ظ… ط§ظ„ط·ظ„ط¨ ظ…ظ† ط§ظ„ظ…ط·ط¹ظ…
    if (act === "picked-up") {
      if (a.user.role !== "driver") return fail("Driver role required", 403, "FORBIDDEN", env);
      const driverUserId = a.user.id ?? a.user.sub;
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(driverUserId).first();
      if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
      const res = await env.DB.prepare("UPDATE orders SET status='picked_up', updated_at=CURRENT_TIMESTAMP WHERE id=? AND driver_id=? AND status='accepted_by_driver'").bind(orderId, d.id).run();
      if (!res.meta.changes) return fail("Order not available for pickup", 409, "INVALID_TRANSITION", env);
      await addEvent(env, orderId, a.user.id, "driver.picked_up", "ط§ظ„ط³ط§ط¦ظ‚ ط§ط³طھظ„ظ… ط§ظ„ط·ظ„ط¨ ظ…ظ† ط§ظ„ظ…ط·ط¹ظ…");
      await notify(env, order.customer_user_id, "طھظ… ط§ط³طھظ„ط§ظ… ط§ظ„ط·ظ„ط¨", "ط§ظ„ط³ط§ط¦ظ‚ ط§ط³طھظ„ظ… ط§ظ„ط·ظ„ط¨ ظ…ظ† ط§ظ„ظ…ط·ط¹ظ….");
      broadcastToOrder(orderId, "order:status", { status: "picked_up" });
      return ok({ message: "picked up" }, env);
    }

    // ط§ظ„ط³ط§ط¦ظ‚ ظپظٹ ط§ظ„ط·ط±ظٹظ‚
    if (act === "on-the-way") {
      if (a.user.role !== "driver") return fail("Driver role required", 403, "FORBIDDEN", env);
      const driverUserId = a.user.id ?? a.user.sub;
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(driverUserId).first();
      if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
      const eta = Math.max(3, Number(b.etaMin || 10));
      const res = await env.DB.prepare("UPDATE orders SET status='on_the_way', eta_min=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND driver_id=? AND status='picked_up'").bind(eta, orderId, d.id).run();
      if (!res.meta.changes) return fail("Order not available for en-route transition", 409, "INVALID_TRANSITION", env);
      await addEvent(env, orderId, a.user.id, "driver.on_the_way", `ط§ظ„ط³ط§ط¦ظ‚ ظپظٹ ط§ظ„ط·ط±ظٹظ‚ ط¥ظ„ظٹظƒ - ${eta} ط¯ظ‚ط§ط¦ظ‚ طھظ‚ط±ظٹط¨ط§ظ‹`);
      await notify(env, order.customer_user_id, "ط§ظ„ط³ط§ط¦ظ‚ ظپظٹ ط§ظ„ط·ط±ظٹظ‚", `ط§ظ„ط³ط§ط¦ظ‚ ظپظٹ ط§ظ„ط·ط±ظٹظ‚ ط¥ظ„ظٹظƒ - ${eta} ط¯ظ‚ط§ط¦ظ‚ طھظ‚ط±ظٹط¨ط§ظ‹.`);
      broadcastToOrder(orderId, "order:status", { status: "on_the_way", eta_min: eta });
      return ok({ message: "on the way", etaMin: eta }, env);
    }

    // طھظ… ط§ظ„طھظˆطµظٹظ„ - ط³ط§ط¦ظ‚ ط£ظˆ ط¹ظ…ظٹظ„ ظٹط¤ظƒط¯ ط§ظ„طھط³ظ„ظٹظ…
    if (act === "delivered") {
      let d = null;
      let isCustomer = false;

      if (a.user.role === "driver") {
        const driverUserId = a.user.id ?? a.user.sub;
        d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(driverUserId).first();
        if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
      } else if (a.user.role === "customer") {
        isCustomer = true;
        if (order.customer_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
        if (!order.driver_id) return fail("Order has no assigned driver", 409, "NO_DRIVER", env);
        d = await env.DB.prepare("SELECT id FROM drivers WHERE id=?").bind(order.driver_id).first();
        if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
      } else {
        return fail("Driver role required", 403, "FORBIDDEN", env);
      }

      // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط£ظ† ط§ظ„ط·ظ„ط¨ ظپظٹ ط§ظ„ط­ط§ظ„ط© ط§ظ„طµط­ظٹط­ط© ظˆظ…ط¹ظٹظ† ظ„ظ‡ط°ط§ ط§ظ„ط³ط§ط¦ظ‚
      // ط§ظ„ط³ط§ط¦ظ‚ ظٹظ…ظƒظ†ظ‡ ط¥ظƒظ…ط§ظ„ ظ…ظ† on_the_wayطŒ ط§ظ„ط¹ظ…ظٹظ„ ظٹظ…ظƒظ†ظ‡ طھط£ظƒظٹط¯ ظ…ظ† on_the_way ط£ظˆ picked_up
      const validStatuses = isCustomer ? "('on_the_way','picked_up')" : "'on_the_way'";
      const res = await env.DB.prepare(
        `UPDATE orders SET status='completed', payment_status=CASE WHEN payment_method='cash' THEN 'paid' ELSE payment_status END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND driver_id=? AND status IN ${validStatuses}`
      ).bind(orderId, d.id).run();

      if (!res.meta.changes) return fail("Order not available for delivery completion", 409, "INVALID_TRANSITION", env);

      const restaurantShare = Math.round(order.subtotal_cents * 0.88);
      const driverShare = order.delivery_fee_cents;
      const platformShare = Math.max(0, order.total_cents - restaurantShare - driverShare);

      await env.DB.batch([
        env.DB.prepare("UPDATE drivers SET status='online' WHERE id=?").bind(d.id)
      ]);

      await creditWallet(env, "restaurant", order.restaurant_id, orderId, restaurantShare, "Restaurant order share");
      await creditWallet(env, "driver", d.id, orderId, driverShare, "Driver delivery fee");
      await creditWallet(env, "platform", "platform", orderId, platformShare, "Platform commission");

      await addEvent(env, orderId, a.user.id, "order.completed", "طھظ… طھط³ظ„ظٹظ… ط§ظ„ط·ظ„ط¨");
      await notify(env, order.customer_user_id, "طھظ… ط§ظ„طھط³ظ„ظٹظ…", "طھظ… طھط³ظ„ظٹظ… ط·ظ„ط¨ظƒ ط¨ظ†ط¬ط§ط­.");
      broadcastToOrder(orderId, "order:status", { status: "completed" });
      return ok({ message: "completed" }, env);
    }

    // ط¥ظ„ط؛ط§ط، ط§ظ„ط·ظ„ط¨
    if (act === "cancel") {
      await env.DB.prepare("UPDATE orders SET status='cancelled', cancel_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.reason || "Cancelled", orderId).run();
      await addEvent(env, orderId, a.user.id, "order.cancelled", b.reason || "طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ط·ظ„ط¨");
      await notify(env, order.customer_user_id, "طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ط·ظ„ط¨", b.reason || "طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ط·ظ„ط¨.");
      broadcastToOrder(orderId, "order:status", { status: "cancelled" });
      broadcastToDrivers("driver:order_cancelled", { order_id: orderId });
      return ok({ message: "cancelled" }, env);
    }

    // طھط³ظ„ظٹظ… ظ„ظ„ط³ط§ط¦ظ‚ (Handoff ظ„ظ„ظ…ط·ط¹ظ…)
    if (act === "handoff") {
      if (a.user.role !== "restaurant" || order.owner_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
      await env.DB.prepare("UPDATE orders SET status='picked_up', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId).run();
      await addEvent(env, orderId, a.user.id, "restaurant.handoff", "طھظ… طھط³ظ„ظٹظ… ط§ظ„ط·ظ„ط¨ ظ„ظ„ط³ط§ط¦ظ‚");
      broadcastToOrder(orderId, "order:status", { status: "picked_up" });
      return ok({ message: "handoff confirmed" }, env);
    }
  }

  // ================================================================
  // GET ORDER - طھظپط§طµظٹظ„ ط§ظ„ط·ظ„ط¨
  // ================================================================

  const single = path.match(/^\/(?:api\/v1|api)\/orders\/([^/]+)$/);
  if (single && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const order = await getOrder(env, single[1]);
    if (!order) return fail("Order not found", 404, "NOT_FOUND", env);
    const items = await env.DB.prepare("SELECT * FROM order_items WHERE order_id=?").bind(order.id).all();
    const events = await env.DB.prepare("SELECT * FROM order_events WHERE order_id=? ORDER BY created_at").bind(order.id).all();
    return ok({ data: { order, items: items.results || [], events: events.results || [] } }, env);
  }

  // ================================================================
  // WALLET - ط§ظ„ظ…ط­ظپط¸ط© ط§ظ„ظ…ط§ظ„ظٹط©
  // ================================================================

  if ((path === "/api/wallet" || path === "/api/v1/wallet") && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    let ownerType = a.user.role, ownerId = a.user.id;
    if (a.user.role === "restaurant") {
      const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
      ownerType = "restaurant";
      ownerId = r?.id;
    }
    if (a.user.role === "driver") {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
      ownerType = "driver";
      ownerId = d?.id;
    }
    const wid = await createWalletIfMissing(env, ownerType, ownerId);
    const wallet = await env.DB.prepare("SELECT * FROM wallets WHERE id=?").bind(wid).first();
    const tx = await env.DB.prepare("SELECT * FROM wallet_transactions WHERE wallet_id=? ORDER BY created_at DESC LIMIT 50").bind(wid).all();
    return ok({ wallet, transactions: tx.results || [] }, env);
  }

  // ================================================================
  // NOTIFICATIONS - ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ ط§ظ„ط¯ط§ط®ظ„ظٹط©
  // ================================================================

  if ((path === "/api/notifications" || path === "/api/v1/notifications") && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(a.user.id).all();
    return ok({ data: rows.results || [], notifications: rows.results || [] }, env);
  }

  // ================================================================
  // SUPPORT TICKETS - طھط°ط§ظƒط± ط§ظ„ط¯ط¹ظ… ط§ظ„ظپظ†ظٹ
  // ================================================================

  if ((path === "/api/support/tickets" || path === "/api/v1/support/tickets") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const b = await readBody(request);
    const tid = uid("t");
    await env.DB.prepare("INSERT INTO support_tickets (id,user_id,order_id,subject,message) VALUES (?,?,?,?,?)").bind(tid, a.user.id, b.orderId || null, b.subject || "Support", b.message || "").run();
    return ok({ id: tid }, env, 201);
  }

  // ================================================================
  // RATINGS - ط§ظ„طھظ‚ظٹظٹظ…ط§طھ
  // ================================================================

  if ((path === "/api/ratings" || path === "/api/v1/ratings") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const b = await readBody(request);
    await env.DB.prepare("INSERT INTO ratings (id,order_id,from_user_id,target_type,target_id,stars,comment) VALUES (?,?,?,?,?,?,?)")
      .bind(uid("rat"), b.orderId, a.user.id, b.targetType, b.targetId, Number(b.stars || 5), b.comment || "").run();
    return ok({ message: "rated" }, env);
  }

  // ================================================================
  // PAYMENTS - ط¨ظˆط§ط¨ط© ط§ظ„ط¯ظپط¹ (Placeholder)
  // ================================================================

  if ((path === "/api/payments/create-intent" || path === "/api/v1/payments/create-intent") && method === "POST") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    return ok({
      enabled: false,
      cashMode: true,
      provider: "stripe/apple_pay/google_pay",
      message: "Payment providers are ready as placeholders. Add Stripe/Apple Pay/Google Pay credentials to activate."
    }, env);
  }

  // ================================================================
  // ADMIN - ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ… (ط®ط§طµ ط¨ط§ظ„ط£ط¯ظ…ظ†)
  // ================================================================

  // ط¥ظ†ط´ط§ط، ط£ظˆظ„ ط£ط¯ظ…ظ† (ط¥ط°ط§ ظ…ط§ ظپظٹ ط£ط¯ظ…ظ†)
  if ((path === "/api/admin/setup" || path === "/api/v1/admin/setup") && method === "POST") {
    const existing = await env.DB.prepare("SELECT COUNT(*) count FROM users WHERE role='admin'").first();
    if (existing && existing.count > 0) return fail("Admin already exists", 403, "ADMIN_EXISTS", env);
    const b = await readBody(request);
    if (!b.email || !b.password || !b.name) return fail("Missing fields", 422, "MISSING_FIELDS", env);
    const userId = uid("u");
    await env.DB.prepare("INSERT INTO users (id, role, name, email, phone, password_hash, status) VALUES (?, 'admin', ?, ?, ?, ?, 'active')")
      .bind(userId, b.name, String(b.email).toLowerCase(), b.phone || null, await hashPassword(b.password)).run();
    await audit(env, { id: userId }, "admin.setup", "user", userId, request);
    return ok({ token: await signJwt({ sub: userId, role: "admin" }, env), user: { id: userId, name: b.name, email: b.email, role: "admin" } }, env, 201);
  }

  // ط¯ط®ظˆظ„ ط§ظ„ط£ط¯ظ…ظ†
  if ((path === "/api/admin/auth/login" || path === "/api/v1/admin/auth/login") && method === "POST") {
    const b = await readBody(request);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=? AND role='admin'").bind(String(b.email || "").toLowerCase()).first();
    if (!user || !(await verifyPassword(b.password || "", user.password_hash))) return fail("Invalid login", 401, "INVALID_LOGIN", env);
    if (user.status !== "active") return fail("Account not active", 403, "ACCOUNT_NOT_ACTIVE", env);
    await audit(env, { id: user.id }, "admin.login", "user", user.id, request);
    return ok({ token: await signJwt({ sub: user.id, role: "admin" }, env), user: { id: user.id, name: user.name, email: user.email, role: user.role } }, env);
  }

  // ظ…ظ„ظپ ط§ظ„ط£ط¯ظ…ظ†
  if ((path === "/api/admin/profile" || path === "/api/v1/admin/profile") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    return ok({ data: a.user }, env);
  }

  // ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…
  if ((path === "/api/admin/dashboard" || path === "/api/v1/admin/dashboard") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const users = await env.DB.prepare("SELECT role, COUNT(*) count FROM users GROUP BY role").all();
    const orders = await env.DB.prepare("SELECT status, COUNT(*) count FROM orders GROUP BY status").all();
    const revenue = await env.DB.prepare("SELECT COALESCE(SUM(total_cents),0) total_cents FROM orders WHERE status='completed'").first();
    const wallets = await env.DB.prepare("SELECT owner_type, COALESCE(SUM(balance_cents),0) balance_cents FROM wallets GROUP BY owner_type").all();
    const activeOrders = await env.DB.prepare("SELECT COUNT(*) count FROM orders WHERE status NOT IN ('completed','cancelled','rejected_by_restaurant')").first();
    return ok({
      customers: (users.results || []).find(u => u.role === "customer")?.count || 0,
      restaurants: (users.results || []).find(u => u.role === "restaurant")?.count || 0,
      drivers: (users.results || []).find(u => u.role === "driver")?.count || 0,
      activeOrders: activeOrders?.count || 0,
      revenueToday: revenue?.total_cents || 0,
      platformCommission: Math.round((revenue?.total_cents || 0) * 0.12),
      users: users.results || [],
      orders: orders.results || [],
      revenue,
      wallets: wallets.results || []
    }, env);
  }

  // ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ†ط´ط·ط© (ظ„ظ„ط£ط¯ظ…ظ†)
  if ((path === "/api/admin/orders" || path === "/api/v1/admin/orders/active" || path === "/api/admin/orders/active") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT o.*, r.name restaurant_name FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.status NOT IN ('completed','cancelled','rejected_by_restaurant') ORDER BY o.created_at DESC LIMIT 200").all();
    return ok({ data: rows.results || [], orders: rows.results || [] }, env);
  }

  // ط¬ظ…ظٹط¹ ط§ظ„ط·ظ„ط¨ط§طھ (ظ„ظ„ط£ط¯ظ…ظ†)
  if (path === "/api/admin/orders" && method === "GET" && !path.includes("active")) {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT o.*, r.name restaurant_name FROM orders o JOIN restaurants r ON r.id=o.restaurant_id ORDER BY o.created_at DESC LIMIT 200").all();
    return ok({ orders: rows.results || [] }, env);
  }

  // ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† (ظ„ظ„ط£ط¯ظ…ظ†)
  if ((path === "/api/admin/users" || path === "/api/v1/admin/users") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT id, role, name, email, phone, status, created_at FROM users ORDER BY created_at DESC").all();
    return ok({ users: rows.results || [] }, env);
  }

  // ط§ظ„ط­ط³ط§ط¨ط§طھ ط­ط³ط¨ ط§ظ„ظ†ظˆط¹ (ظ„ظ„ط£ط¯ظ…ظ†)
  if ((path === "/api/admin/accounts" || path === "/api/v1/admin/accounts") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const type = url.searchParams.get("type") || "customers";
    let rows = [];
    if (type === "customers") rows = (await env.DB.prepare("SELECT id, name, email, phone, status, created_at FROM users WHERE role='customer' ORDER BY created_at DESC").all()).results || [];
    if (type === "restaurants") {
      const r = (await env.DB.prepare("SELECT u.id, u.name, u.email, u.phone, u.status, r.name AS restaurant_name, r.verification_status FROM users u JOIN restaurants r ON r.owner_user_id=u.id WHERE u.role='restaurant' ORDER BY u.created_at DESC").all()).results || [];
      return ok({ data: r }, env);
    }
    if (type === "drivers") {
      const d = (await env.DB.prepare("SELECT u.id, u.name, u.email, u.phone, u.status, d.vehicle, d.plate_number, d.verification_status FROM users u JOIN drivers d ON d.user_id=u.id WHERE u.role='driver' ORDER BY u.created_at DESC").all()).results || [];
      return ok({ data: d }, env);
    }
    return ok({ data: rows }, env);
  }

  // ط¥ط´ط¹ط§ط±ط§طھ ط§ظ„ط£ط¯ظ…ظ†
  if ((path === "/api/admin/notifications" || path === "/api/v1/admin/notifications") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all();
    return ok({ data: rows.results || [] }, env);
  }

  // ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ظ…ظ†طµط©
  if ((path === "/api/admin/settings" || path === "/api/v1/admin/settings") && method === "PUT") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const b = await readBody(request);
    // ظ‡ظ†ط§ ظٹطھظ… طھط®ط²ظٹظ† ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ (ط­ط§ظ„ظٹظ‹ط§ ظ†ط³ط¬ظ„ ظپظ‚ط· - ظٹظ…ظƒظ† ط¥ط¶ط§ظپط© ط¬ط¯ظˆظ„ settings ظ„ط§ط­ظ‚ظ‹ط§)
    await audit(env, a.user, "admin.settings", "settings", null, request);
    return ok({ message: "saved" }, env);
  }

  // ================================================================
  // ADMIN DOCUMENTS - ط¥ط¯ط§ط±ط© ظ…ط³طھظ†ط¯ط§طھ ط§ظ„ط£ط¯ظ…ظ†
  // ================================================================

  // ظ‚ط§ط¦ظ…ط© ظƒظ„ ط§ظ„ظ…ط³طھظ†ط¯ط§طھ
  if ((path === "/api/admin/documents" || path === "/api/v1/admin/documents") && method === "GET") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const rows = await env.DB.prepare("SELECT * FROM documents ORDER BY created_at DESC LIMIT 100").all();
    return ok({ documents: rows.results || [], data: rows.results || [] }, env);
  }

  // ط§ظ„ظ…ظˆط§ظپظ‚ط© ط£ظˆ ط±ظپط¶ ظ…ط³طھظ†ط¯
  const docApprove = path.match(/^\/api\/admin\/documents\/([^/]+)\/(approve|reject)$/);
  if (docApprove && method === "POST") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const status = docApprove[2] === "approve" ? "approved" : "rejected";
    const b = await readBody(request);
    await env.DB.prepare("UPDATE documents SET status=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP, review_note=? WHERE id=?").bind(status, a.user.id, b.reviewNote || null, docApprove[1]).run();
    // ط¥ط°ط§ طھظ…طھ ط§ظ„ظ…ظˆط§ظپظ‚ط©طŒ ظ†ط­ط¯ط« ط­ط§ظ„ط© ط§ظ„ظ…ط·ط¹ظ… ط£ظˆ ط§ظ„ط³ط§ط¦ظ‚
    const doc = await env.DB.prepare("SELECT * FROM documents WHERE id=?").bind(docApprove[1]).first();
    if (doc && status === "approved") {
      if (doc.owner_type === "restaurant") {
        await env.DB.prepare("UPDATE restaurants SET verification_status='approved' WHERE id=?").bind(doc.owner_id).run();
      }
      if (doc.owner_type === "driver") {
        await env.DB.prepare("UPDATE drivers SET verification_status='approved' WHERE id=?").bind(doc.owner_id).run();
      }
    }
    await audit(env, a.user, "document." + docApprove[2], "document", docApprove[1], request);
    return ok({ status }, env);
  }

  // ط§ظ„ظ…ظˆط§ظپظ‚ط© ط£ظˆ ط±ظپط¶ ط­ط³ط§ط¨ ط³ط§ط¦ظ‚/ظ…ط·ط¹ظ… ظ…ط¨ط§ط´ط±ط© (ط¨ط¯ظˆظ† ظ…ط³طھظ†ط¯ط§طھ)
  const userApprove = path.match(/^\/api\/admin\/users\/([^/]+)\/(approve|reject)$/);
  if (userApprove && method === "POST") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const userId = userApprove[1];
    const action = userApprove[2];
    const status = action === "approve" ? "approved" : "rejected";
    const user = await env.DB.prepare("SELECT id, role FROM users WHERE id=?").bind(userId).first();
    if (!user) return fail("User not found", 404, "NOT_FOUND", env);
    if (user.role === "driver") {
      await env.DB.prepare("UPDATE drivers SET verification_status=? WHERE user_id=?").bind(status, userId).run();
    } else if (user.role === "restaurant") {
      await env.DB.prepare("UPDATE restaurants SET verification_status=? WHERE owner_user_id=?").bind(status, userId).run();
    } else {
      return fail("User type does not support verification", 422, "INVALID_ROLE", env);
    }
    await audit(env, a.user, "user." + action, "user", userId, request);
    return ok({ status }, env);
  }

  // ط­ط°ظپ ط­ط³ط§ط¨ ظ…ط³طھط®ط¯ظ… (ظ„ظ„ط£ط¯ظ…ظ†)
  const userDelete = path.match(/^\/api\/admin\/users\/([^/]+)\/delete$/);
  if (userDelete && method === "POST") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const userId = userDelete[1];
    const user = await env.DB.prepare("SELECT id, role FROM users WHERE id=?").bind(userId).first();
    if (!user) return fail("User not found", 404, "NOT_FOUND", env);
    if (user.role === "driver") {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(userId).first();
      if (d) {
        await env.DB.prepare("UPDATE orders SET driver_id=NULL WHERE driver_id=?").bind(d.id).run();
        await env.DB.prepare("DELETE FROM driver_locations WHERE driver_id=?").bind(d.id).run();
        await env.DB.prepare("DELETE FROM documents WHERE owner_type='driver' AND owner_id=?").bind(d.id).run();
        await env.DB.prepare("DELETE FROM wallets WHERE owner_type='driver' AND owner_id=?").bind(d.id).run();
        await env.DB.prepare("DELETE FROM drivers WHERE id=?").bind(d.id).run();
      }
    } else if (user.role === "restaurant") {
      const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(userId).first();
      if (r) {
        await env.DB.prepare("DELETE FROM documents WHERE owner_type='restaurant' AND owner_id=?").bind(r.id).run();
        await env.DB.prepare("DELETE FROM wallets WHERE owner_type='restaurant' AND owner_id=?").bind(r.id).run();
        await env.DB.prepare("DELETE FROM restaurants WHERE id=?").bind(r.id).run();
      }
    }
    await env.DB.prepare("DELETE FROM notifications WHERE user_id=?").bind(userId).run();
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId).run();
    await audit(env, a.user, "user.delete", "user", userId, request);
    return ok({ deleted: true }, env);
  }

  // ================================================================
  // [ط§ظ„ظ…ظٹط²ط© 1] DOCUMENTS UPLOAD - ط±ظپط¹ ط§ظ„ظ…ط³طھظ†ط¯ط§طھ
  // ================================================================

  // ط±ظپط¹ ظ…ط³طھظ†ط¯ (ظ„ظ„ط³ط§ط¦ظ‚ظٹظ† ظˆط§ظ„ظ…ط·ط§ط¹ظ…)
  // ظٹط³طھظ‚ط¨ظ„ multipart/form-data: file, document_type
  if ((path === "/api/documents/upload" || path === "/api/v1/documents/upload") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    if (!["driver", "restaurant"].includes(a.user.role)) return fail("Only drivers and restaurants can upload documents", 403, "FORBIDDEN", env);

    // ظ‚ط±ط§ط،ط© ط§ظ„ظ€ FormData
    const formData = await readFormData(request);
    if (!formData) return fail("Invalid form data", 422, "INVALID_FORM", env);

    const file = formData.get("file");
    const documentType = formData.get("document_type") || "general";
    const fileName = formData.get("file_name") || file?.name || "document";

    if (!file) return fail("File is required", 422, "FILE_REQUIRED", env);

    const fileBuffer = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";
    const fileSize = file.size;

    // طھط­ط¯ظٹط¯ owner_id ط­ط³ط¨ ط§ظ„ط¯ظˆط±
    let ownerType = a.user.role;
    let ownerId = a.user.id;
    if (a.user.role === "restaurant") {
      const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
      if (r) ownerId = r.id;
    }
    if (a.user.role === "driver") {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
      if (d) ownerId = d.id;
    }

    const docId = uid("doc");
    const docKey = `documents/${docId}.${mimeType.split('/')[1] || 'bin'}`;
    const fileUrl = await uploadFile(env, docKey, fileBuffer, mimeType);
    await env.DB.prepare("INSERT INTO documents (id, owner_type, owner_id, document_type, file_name, file_data, file_size, mime_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')")
      .bind(docId, ownerType, ownerId, documentType, fileName, fileUrl, fileSize, mimeType).run();

    await audit(env, a.user, "document.upload", "document", docId, request);
    return ok({ id: docId, message: "Document uploaded successfully, pending review" }, env, 201);
  }

  // ظ‚ط§ط¦ظ…ط© ظ…ط³طھظ†ط¯ط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ط­ط§ظ„ظٹ
  if ((path === "/api/documents/list" || path === "/api/v1/documents/list") && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    let ownerType = a.user.role, ownerId = a.user.id;
    if (a.user.role === "restaurant") {
      const r = await env.DB.prepare("SELECT id FROM restaurants WHERE owner_user_id=?").bind(a.user.id).first();
      if (r) ownerId = r.id;
    }
    if (a.user.role === "driver") {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
      if (d) ownerId = d.id;
    }
    const rows = await env.DB.prepare("SELECT id, owner_type, document_type, file_name, mime_type, file_size, status, reviewed_by, reviewed_at, created_at FROM documents WHERE owner_type=? AND owner_id=? ORDER BY created_at DESC").bind(ownerType, ownerId).all();
    return ok({ data: rows.results || [], documents: rows.results || [] }, env);
  }

  // ================================================================
  // [ط§ظ„ظ…ظٹط²ط© 2] DRIVER GPS TRACKING - طھطھط¨ط¹ ط§ظ„ط³ط§ط¦ظ‚ ظ„ظ„ط¹ظ…ظٹظ„
  // ================================================================

  // ط¬ظ„ط¨ ط¢ط®ط± ظ…ظˆظ‚ط¹ ظ„ظ„ط³ط§ط¦ظ‚ ظ„ط·ظ„ط¨ ظ…ط¹ظٹظ† (ظ„ظ„ط¹ظ…ظٹظ„)
  if ((path === "/api/tracking/order" || path === "/api/v1/tracking/order") && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    return ok({ data: null }, env);
  }

  const trackingOrder = path.match(/^\/api\/tracking\/order\/([^/]+)$/);
  if (trackingOrder && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const order = await env.DB.prepare("SELECT o.*, d.id driver_id, d.lat, d.lng, d.last_location_at FROM orders o LEFT JOIN drivers d ON d.id=o.driver_id WHERE o.id=?").bind(trackingOrder[1]).first();
    if (!order) return fail("Order not found", 404, "NOT_FOUND", env);
    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„طµظ„ط§ط­ظٹط©: ط§ظ„ط¹ظ…ظٹظ„ طµط§ط­ط¨ ط§ظ„ط·ظ„ط¨ ط£ظˆ ط§ظ„ط³ط§ط¦ظ‚ ط£ظˆ ط§ظ„ط£ط¯ظ…ظ†
    if (a.user.role !== "admin" && a.user.role !== "driver" && order.customer_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);
    if (a.user.role === "driver") {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
      if (d?.id !== order.driver_id) return fail("Forbidden", 403, "FORBIDDEN", env);
    }
    return ok({
      data: {
        driver_id: order.driver_id,
        lat: order.lat,
        lng: order.lng,
        last_location_at: order.last_location_at,
        status: order.status,
        eta_min: order.eta_min
      }
    }, env);
  }

  // ظ…ظˆظ‚ط¹ ط³ط§ط¦ظ‚ ظ…ط¹ظٹظ† (ظ„ظ„ط£ط¯ظ…ظ†)
  const driverLocation = path.match(/^\/api\/driver\/location\/([^/]+)$/);
  if (driverLocation && method === "GET") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    if (a.user.role !== "admin") return fail("Forbidden", 403, "FORBIDDEN", env);
    const d = await env.DB.prepare("SELECT id, lat, lng, last_location_at, status FROM drivers WHERE id=?").bind(driverLocation[1]).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    return ok({ data: d }, env);
  }

  // ================================================================
  // [ط§ظ„ظ…ظٹط²ط© 3] REALTIME VIA WEBSOCKET - طھظ…طھ ط§ظ„ظ…ط¹ط§ظ„ط¬ط© ط£ط¹ظ„ط§ظ‡
  // WebSocket endpoint (ط¨ط¯ظٹظ„ ظ…ط³ط§ط±)
  // ================================================================

  // ظ†ظ‚ط·ط© ظ†ظ‡ط§ظٹط© WebSocket (ظ„ظ„ط§طھطµط§ظ„ ط§ظ„ظ…ط¨ط§ط´ط±)
  if (path === "/api/realtime" || path === "/api/v1/realtime" || path === "/ws") {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      // WebSocket ظ…ط¹ط§ظ„ط¬ ظˆظ…ظˆط¬ظˆط¯ ط£ط¹ظ„ط§ظ‡
      const wsResp = handleWebSocket(request, env);
      if (wsResp) return wsResp;
    }
    // ط¥ط°ط§ ظƒط§ظ† GET ط¨ط¯ظˆظ† WebSocket upgradeطŒ ظ†ط±ط¬ط¹ ط±ط³ط§ظ„ط© طھط¹ط±ظٹظپظٹط©
    if (method === "GET") {
      return ok({ service: "Fairfood Realtime", protocol: "WebSocket", status: "ready" }, env);
    }
  }

  // ================================================================
  // [ط§ظ„ظ…ظٹط²ط© 4] PUSH NOTIFICATIONS - ط¥ط´ط¹ط§ط±ط§طھ ط§ظ„ط¬ظˆط§ظ„
  // ================================================================

  // طھط³ط¬ظٹظ„ ط¬ظ‡ط§ط² ظ„ظ„ط¥ط´ط¹ط§ط±ط§طھ
  if ((path === "/api/push/register" || path === "/api/v1/push/register") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const b = await readBody(request);
    if (!b.device_token || !b.platform) return fail("Missing device_token or platform", 422, "MISSING_FIELDS", env);
    if (!["ios", "android", "web"].includes(b.platform)) return fail("Invalid platform", 422, "INVALID_PLATFORM", env);

    // ط­ط°ظپ ط§ظ„طھظˆظƒظ† ط§ظ„ظ‚ط¯ظٹظ… ط¥ط°ط§ ظƒط§ظ† ظ…ظˆط¬ظˆط¯ط§ظ‹
    await env.DB.prepare("DELETE FROM push_tokens WHERE device_token=?").bind(b.device_token).run();

    const ptId = uid("pt");
    await env.DB.prepare("INSERT INTO push_tokens (id, user_id, device_token, platform, device_name) VALUES (?, ?, ?, ?, ?)")
      .bind(ptId, a.user.id, b.device_token, b.platform, b.device_name || null).run();
    return ok({ message: "Device registered for push notifications" }, env, 201);
  }

  // ط¥ط±ط³ط§ظ„ ط¥ط´ط¹ط§ط± (ظ„ظ„ط£ط¯ظ…ظ† ط£ظˆ ط§ظ„ط³ظٹط±ظپط±)
  if ((path === "/api/push/send" || path === "/api/v1/push/send") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    if (a.user.role !== "admin") return fail("Admin only", 403, "FORBIDDEN", env);
    const b = await readBody(request);
    if (!b.user_id || !b.title) return fail("Missing user_id or title", 422, "MISSING_FIELDS", env);

    await sendPushNotification(env, b.user_id, b.title, b.body || "", b.data || {});
    await notify(env, b.user_id, b.title, b.body || "");
    return ok({ message: "Push notification sent" }, env);
  }

  // ط¥ظ„ط؛ط§ط، طھط³ط¬ظٹظ„ ط¬ظ‡ط§ط²
  if ((path === "/api/push/unregister" || path === "/api/v1/push/unregister") && method === "POST") {
    const a = await requireAuth(request, env);
    if (a.error) return a.error;
    const b = await readBody(request);
    if (!b.device_token) return fail("Missing device_token", 422, "MISSING_FIELDS", env);
    await env.DB.prepare("UPDATE push_tokens SET is_active=0 WHERE device_token=? AND user_id=?").bind(b.device_token, a.user.id).run();
    return ok({ message: "Device unregistered" }, env);
  }

  // ================================================================
  // [ط§ظ„ظ…ظٹط²ط© 5] STRIPE INTEGRATION - ط¨ظˆط§ط¨طھ ط§ظ„ط¯ظپط¹
  // ================================================================

  // ط¥ظ†ط´ط§ط، ط¬ظ„ط³ط© ط¯ظپط¹ (Stripe Checkout Session)
  if ((path === "/api/stripe/checkout" || path === "/api/v1/stripe/checkout") && method === "POST") {
    const a = await requireAuth(request, env, "customer");
    if (a.error) return a.error;
    const b = await readBody(request);

    // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط£ظ† Stripe ظ…ظپط¹ظ„
    if (!env.STRIPE_SECRET_KEY) {
      return ok({
        enabled: false,
        message: "Stripe is not configured. Set STRIPE_SECRET_KEY environment variable."
      }, env);
    }

    if (!b.order_id) return fail("Missing order_id", 422, "MISSING_FIELDS", env);
    const order = await getOrder(env, b.order_id);
    if (!order) return fail("Order not found", 404, "NOT_FOUND", env);
    if (order.customer_user_id !== a.user.id) return fail("Forbidden", 403, "FORBIDDEN", env);

    // ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¹ظ…ظ„ط© ط§ظ„ظ…ط·ط¹ظ…
    const restaurant = await env.DB.prepare("SELECT currency FROM restaurants WHERE id=?").bind(order.restaurant_id).first();
    const currency = (restaurant?.currency || 'SAR').toLowerCase();

    // ط§ظ„ط¹ظ…ظ„ط§طھ ط§ظ„ظ…ط¯ط¹ظˆظ…ط© ظپظٹ Stripe
    const supportedCurrencies = ['sar','usd','eur','aed','egp','gbp','cad','aud','jpy','inr','bhd','kwd','omr','qar','jod','lbp','mad','tnd','dzd','lyd','sdg','try','ils','czk','huf','pln','ron','bgn','hrk','isk','nok','sek','dkk','chf','rub','uah','bgn','ron'];
    const finalCurrency = supportedCurrencies.includes(currency) ? currency : 'sar';

    try {
      // ط¥ظ†ط´ط§ط، Stripe Checkout Session
      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Bearer " + env.STRIPE_SECRET_KEY
        },
        body: new URLSearchParams({
          "mode": "payment",
          "success_url": (env.PUBLIC_API_BASE || "https://fairfood.fairfood100.workers.dev") + "/payment/success?session_id={CHECKOUT_SESSION_ID}",
          "cancel_url": (env.PUBLIC_API_BASE || "https://fairfood.fairfood100.workers.dev") + "/payment/cancel",
          "currency": finalCurrency,
          "line_items[0][price_data][currency]": finalCurrency,
          "line_items[0][price_data][product_data][name]": "ط·ظ„ط¨ ط±ظ‚ظ… " + order.id.slice(0, 8),
          "line_items[0][price_data][unit_amount]": String(order.total_cents),
          "line_items[0][quantity]": "1",
          "metadata[order_id]": order.id,
          "metadata[customer_id]": a.user.id
        })
      });

      const session = await stripeRes.json();

      if (!stripeRes.ok) {
        return fail(session.error?.message || "Stripe error", 402, "STRIPE_ERROR", env);
      }

      // طھط®ط²ظٹظ† ظ…ط¹ط±ظپ ط§ظ„ط¬ظ„ط³ط© ظپظٹ ط§ظ„ط·ظ„ط¨
      await env.DB.prepare("UPDATE orders SET stripe_payment_intent_id=?, payment_method='stripe', payment_status='pending' WHERE id=?")
        .bind(session.payment_intent || session.id, order.id).run();

      return ok({ sessionId: session.id, url: session.url }, env);
    } catch (e) {
      return fail("Stripe checkout failed: " + e.message, 402, "STRIPE_ERROR", env);
    }
  }

  // ط§ط³طھظ‚ط¨ط§ظ„ Webhook ظ…ظ† Stripe
  if ((path === "/api/stripe/webhook" || path === "/api/v1/stripe/webhook") && method === "POST") {
    const rawBody = await request.clone().text();

    if (env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET) {
      const sig = request.headers.get("stripe-signature");
      if (!sig) return fail("Missing stripe-signature header", 401, "SIGNATURE_MISSING", env);
      try {
        const parts = Object.fromEntries(sig.split(',').map(p => {
          const [k, v] = p.trim().split('=');
          return [k, v];
        }));
        const timestamp = parts.t;
        const sig1 = parts.v1;
        if (!timestamp || !sig1) throw new Error('Invalid signature format');
        const payload = `${timestamp}.${rawBody}`;
        const key = new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET);
        const keyData = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sigBytes = await crypto.subtle.sign('HMAC', keyData, new TextEncoder().encode(payload));
        const expected = [...new Uint8Array(sigBytes)].map(b => b.toString(16).padStart(2, '0')).join('');
        if (expected !== sig1) throw new Error('Signature mismatch');
      } catch (e) {
        return fail('Invalid signature: ' + e.message, 401, 'INVALID_SIGNATURE', env);
      }
    }

    const event = JSON.parse(rawBody);

    // ظ…ط¹ط§ظ„ط¬ط© ط§ظ„ط£ط­ط¯ط§ط«
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        await env.DB.prepare("UPDATE orders SET payment_status='paid', stripe_payment_intent_id=? WHERE id=?")
          .bind(session.payment_intent || session.id, orderId).run();
        await notify(env, session.metadata?.customer_id, "طھظ… طھط£ظƒظٹط¯ ط§ظ„ط¯ظپط¹", "طھظ… ط¯ظپط¹ ط§ظ„ط·ظ„ط¨ ط¨ظ†ط¬ط§ط­.");
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object;
      const orderId = intent.metadata?.order_id;
      if (orderId) {
        await env.DB.prepare("UPDATE orders SET payment_status='failed' WHERE id=?").bind(orderId).run();
      }
    }

    return ok({ received: true }, env);
  }

  // ط§ط³طھط±ط¯ط§ط¯ ظ…ط¨ظ„ط؛ (Refund)
  if ((path === "/api/stripe/refund" || path === "/api/v1/stripe/refund") && method === "POST") {
    const a = await requireAuth(request, env, "admin");
    if (a.error) return a.error;
    const b = await readBody(request);
    if (!b.order_id) return fail("Missing order_id", 422, "MISSING_FIELDS", env);
    if (!env.STRIPE_SECRET_KEY) return fail("Stripe not configured", 503, "STRIPE_NOT_CONFIGURED", env);

    const order = await getOrder(env, b.order_id);
    if (!order) return fail("Order not found", 404, "NOT_FOUND", env);
    if (!order.stripe_payment_intent_id) return fail("No Stripe payment found for this order", 422, "NO_PAYMENT", env);

    try {
      const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Bearer " + env.STRIPE_SECRET_KEY
        },
        body: new URLSearchParams({
          "payment_intent": order.stripe_payment_intent_id,
          "amount": String(b.amount_cents || order.total_cents)
        })
      });
      const refund = await refundRes.json();

      if (!refundRes.ok) {
        return fail(refund.error?.message || "Refund failed", 402, "REFUND_ERROR", env);
      }

      await env.DB.prepare("UPDATE orders SET payment_status='refunded', cancel_reason=COALESCE(?,cancel_reason), updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(b.reason || "Refunded", b.order_id).run();

      await audit(env, a.user, "stripe.refund", "order", b.order_id, request);
      return ok({ refundId: refund.id, status: refund.status }, env);
    } catch (e) {
      return fail("Refund failed: " + e.message, 402, "REFUND_ERROR", env);
    }
  }

  // ================================================================
  // FILES - ط®ط¯ظ…ط© ط§ظ„ظ…ظ„ظپط§طھ ظ…ظ† R2
  // ================================================================

  const filesMatch = path.match(/^\/api\/files\/(.+)$/);
  if (filesMatch && method === "GET") {
    const key = filesMatch[1];
    const file = await serveFile(env, key);
    if (file) return file;
    return fail("Not found", 404, "NOT_FOUND", env);
  }

  // ================================================================
  // GEOCODING - طھط­ظˆظٹظ„ ط§ظ„ط¥ط­ط¯ط§ط«ظٹط§طھ ط¥ظ„ظ‰ ط¹ظ†ظˆط§ظ†
  // ================================================================

  if ((path === "/api/geo/reverse" || path === "/api/v1/geo/reverse") && method === "GET") {
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    if (!lat || !lng) return fail("Missing lat/lng", 422, "MISSING_PARAMS", env);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`, {
        headers: { "User-Agent": "Fairfood/1.0" }
      });
      const data = await res.json();
      return ok({ data: { display_name: data.display_name || "Unknown location", lat, lng } }, env);
    } catch (e) {
      return ok({ data: { display_name: `${lat}, ${lng}`, lat, lng } }, env);
    }
  }

  // ================================================================
  // ظ…ط³ط§ط±ط§طھ ط§ظ„طھظˆط§ظپظ‚ ظ…ط¹ ط§ظ„طھط·ط¨ظٹظ‚ط§طھ (Action-based routing)
  // ط§ظ„طھط·ط¨ظٹظ‚ط§طھ ط§ظ„ط¬ط¯ظٹط¯ط© طھط³طھط®ط¯ظ… ?action= ط¨ط¯ظ„ ط§ظ„ظ…ط³ط§ط±ط§طھ
  // ================================================================

  // GET /api/driver?action=profile (ظ…ظ„ظپ ط§ظ„ط³ط§ط¦ظ‚)
  // GET /api/driver?action=available (ط§ظ„ط·ظ„ط¨ط§طھ ط§ظ„ظ…طھط§ط­ط©)
  if ((path === "/api/driver" || path === "/api/v1/driver") && method === "GET") {
    const action = url.searchParams.get("action");
    if (action === "profile") {
      const a = await requireAuth(request, env, "driver");
      if (a.error) return a.error;
      const d = await env.DB.prepare("SELECT * FROM drivers WHERE user_id=?").bind(a.user.id).first();
      const mEarnings = d ? await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND date(o.updated_at)=date('now')").bind(d.id).first() : { total: 0 };
      const wEarnings = d ? await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND o.updated_at >= datetime('now', '-7 days')").bind(d.id).first() : { total: 0 };
      const userData = {
        ...a.user, driver: d,
        vehicle_plate: d?.plate_number || "", vehicle_model: d?.vehicle_model || "",
        rating: d?.rating || 0, total_deliveries: d?.total_deliveries || 0,
        today_earnings: mEarnings?.total || 0, weekly_earnings: wEarnings?.total || 0,
        monthly_earnings: 0
      };
      delete userData.password_hash;
      return ok({ data: userData }, env);
    }
    if (action === "available") {
      const a = await requireAuth(request, env, "driver");
      if (a.error) return a.error;
      const rows = await env.DB.prepare("SELECT o.*, r.name AS restaurant_name, r.address AS restaurant_address, r.lat AS restaurant_lat, r.lng AS restaurant_lng FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.status='ready_for_driver' AND o.driver_id IS NULL ORDER BY o.updated_at ASC LIMIT 50").all();
      const orders = (rows.results || []).map(o => ({
        ...o, estimated_earning: o.delivery_fee_cents || 0,
        destination_lat: o.restaurant_lat, destination_lng: o.restaurant_lng
      }));
      return ok({ data: orders }, env);
    }
    return fail("Unknown action", 400, "UNKNOWN_ACTION", env);
  }

  // POST /api/driver (طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ط³ط§ط¦ظ‚)
  if ((path === "/api/driver" || path === "/api/v1/driver") && method === "POST") {
    const b = await readBody(request);
    if (b.action === "status") {
      const a = await requireAuth(request, env, "driver");
      if (a.error) return a.error;
      const status = b.isOnline ? "online" : "offline";
      await env.DB.prepare("UPDATE drivers SET status=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(status, a.user.id).run();
      return ok({ status }, env);
    }
    return fail("Unknown action", 400, "UNKNOWN_ACTION", env);
  }

  // POST /api/driver-order (ظ‚ط¨ظˆظ„/ط±ظپط¶ ط·ظ„ط¨)
  if ((path === "/api/driver-order" || path === "/api/v1/driver-order") && method === "POST") {
    const b = await readBody(request);
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    if (!b.orderId || !b.action) return fail("Missing orderId or action", 422, "MISSING_FIELDS", env);
    if (b.action === "accept") {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
      if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
      await env.DB.prepare("UPDATE orders SET driver_id=?, status='accepted_by_driver', updated_at=CURRENT_TIMESTAMP WHERE id=? AND driver_id IS NULL").bind(d.id, b.orderId).run();
      await addEvent(env, b.orderId, "accepted_by_driver", "طھظ… ظ‚ط¨ظˆظ„ ط§ظ„ط·ظ„ط¨ ظ…ظ† ط§ظ„ط³ط§ط¦ظ‚");
      broadcastToOrder(b.orderId, "order:status", { status: "accepted_by_driver", driverId: d.id });
      return ok({ message: "Order accepted" }, env);
    }
    if (b.action === "reject") {
      await env.DB.prepare("UPDATE orders SET status='new', updated_at=CURRENT_TIMESTAMP WHERE id=? AND driver_id IS NOT NULL").bind(b.orderId).run();
      return ok({ message: "Order rejected" }, env);
    }
    return fail("Unknown action", 400, "UNKNOWN_ACTION", env);
  }

  // GET /api/finance?action=wallet (ظ…ط­ظپط¸ط© ظˆط£ط±ط¨ط§ط­ ط§ظ„ط³ط§ط¦ظ‚)
  // GET /api/finance?action=transactions (ط­ط±ظƒط§طھ ط§ظ„ظ…ط­ظپط¸ط©)
  if ((path === "/api/finance" || path === "/api/v1/finance") && method === "GET") {
    const action = url.searchParams.get("action");
    const a = await requireAuth(request, env, "driver");
    if (a.error) return a.error;
    const d = await env.DB.prepare("SELECT id FROM drivers WHERE user_id=?").bind(a.user.id).first();
    if (!d) return fail("Driver not found", 404, "NOT_FOUND", env);
    if (action === "wallet") {
      const today = await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND date(o.updated_at)=date('now')").bind(d.id).first();
      const week = await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND o.updated_at >= datetime('now', '-7 days')").bind(d.id).first();
      const month = await env.DB.prepare("SELECT COALESCE(SUM(o.delivery_fee_cents),0) total FROM orders o WHERE o.driver_id=? AND o.status='completed' AND o.updated_at >= datetime('now', '-30 days')").bind(d.id).first();
      const wallet = await env.DB.prepare("SELECT balance_cents, pending_cents FROM wallets WHERE owner_type='driver' AND owner_id=?").bind(d.id).first();
      const bal = Math.round((wallet?.balance_cents || 0) / 100);
      return ok({ data: { balance: bal, balance_cents: wallet?.balance_cents || 0, pending_cents: wallet?.pending_cents || 0, today_earnings: today?.total || 0, weekly_earnings: week?.total || 0, monthly_earnings: month?.total || 0, today_deliveries: 0 } }, env);
    }
    if (action === "transactions") {
      const wid = await createWalletIfMissing(env, "driver", d.id);
      const tx = await env.DB.prepare("SELECT * FROM wallet_transactions WHERE wallet_id=? ORDER BY created_at DESC LIMIT 50").bind(wid).all();
      const mapped = (tx.results || []).map(t => ({ description: t.note || "ط­ط±ظƒط© ظ…ط§ظ„ظٹط©", created_at: t.created_at, type: t.type, amount: Math.round((t.amount_cents || 0) / 100) }));
      return ok({ data: mapped }, env);
    }
    return fail("Unknown action", 400, "UNKNOWN_ACTION", env);
  }

  // ================================================================
  // ط¢ط®ط± ط´ظٹط،: ط§ظ„ظ…ط³ط§ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯
  // ================================================================

  return fail("Route not found", 404, "ROUTE_NOT_FOUND", env);
}

// ============================================================
// طھطµط¯ظٹط± ط§ظ„ظ€ Worker
// ============================================================
export default {
  async fetch(request, env) {
    try {
      return await app(request, env);
    } catch (e) {
      console.error("Unhandled error:", e);
      return fail(e.message || "Internal server error", e.status || 500, "INTERNAL", env);
    }
  }
};
