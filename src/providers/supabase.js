// src/providers/supabase.js — Supabase Client (CommonJS)
// Server-side client with service role key for API endpoints
// Handles: users, credits, payments, reports

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// =============================================
// Lightweight Supabase REST client (zero deps)
// =============================================
class SupabaseClient {
  constructor(url, key) {
    this.url = url.replace(/\/$/, "");
    this.key = key;
    this.restUrl = `${this.url}/rest/v1`;
    this.authUrl = `${this.url}/auth/v1`;
  }

  async query(table, { method = "GET", filters = {}, body = null, select = "*", single = false, upsert = false } = {}) {
    let url = `${this.restUrl}/${table}?select=${encodeURIComponent(select)}`;

    // Apply filters
    for (const [key, val] of Object.entries(filters)) {
      if (typeof val === "object" && val !== null) {
        // Support operators: { col: { op: 'eq', val: 'x' } }
        url += `&${key}=${val.op}.${encodeURIComponent(val.val)}`;
      } else {
        url += `&${key}=eq.${encodeURIComponent(val)}`;
      }
    }

    const headers = {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    };

    if (single) headers.Accept = "application/vnd.pgrst.object+json";
    if (method === "POST" && upsert) headers.Prefer = "resolution=merge-duplicates";
    if (method === "POST" && !upsert) headers.Prefer = "return=representation";
    if (method === "PATCH") headers.Prefer = "return=representation";

    const options = { method, headers };
    if (body && (method === "POST" || method === "PATCH")) {
      options.body = JSON.stringify(body);
    }

    const res = await fetchTimeout(url, options);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: { status: res.status, message: text.substring(0, 300) } };
    }

    if (res.status === 204) return { data: null, error: null };

    const data = await res.json();
    return { data: single ? data : data, error: null };
  }

  // Auth helpers
  async signUp(email, password) {
    const res = await fetchTimeout(`${this.authUrl}/signup`, {
      method: "POST",
      headers: { apikey: this.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { user: null, error: data.msg || data.error_description || "Signup failed" };
    return { user: data.user || data, session: data.session, error: null };
  }

  async signIn(email, password) {
    const res = await fetchTimeout(`${this.authUrl}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: this.key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { user: null, error: data.msg || data.error_description || "Login failed" };
    return { user: data.user, session: { access_token: data.access_token, refresh_token: data.refresh_token }, error: null };
  }

  async getUser(accessToken) {
    const res = await fetchTimeout(`${this.authUrl}/user`, {
      headers: { apikey: this.key, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { user: null, error: "Invalid session" };
    const user = await res.json();
    return { user, error: null };
  }
}

// =============================================
// Database operations
// =============================================

/** Get server-side client (service role — full access) */
function getServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  return new SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/** Get anon client (for auth operations) */
function getAnonClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- Credits ---
async function getCredits(userId) {
  const db = getServiceClient();
  if (!db) return { credits: 0, error: "Supabase not configured" };

  const { data, error } = await db.query("aml_credits", {
    filters: { user_id: userId },
    single: true,
  });
  if (error?.status === 406) return { credits: 0, error: null }; // not found = 0
  if (error) return { credits: 0, error: error.message };
  return { credits: data?.balance || 0, error: null };
}

async function addCredits(userId, amount, txHash, usdtAmount) {
  const db = getServiceClient();
  if (!db) return { error: "Supabase not configured" };

  // 1. Upsert credits
  const current = await getCredits(userId);
  const newBalance = (current.credits || 0) + amount;

  await db.query("aml_credits", {
    method: "POST",
    upsert: true,
    body: { user_id: userId, balance: newBalance, updated_at: new Date().toISOString() },
  });

  // 2. Record payment
  await db.query("aml_payments", {
    method: "POST",
    body: {
      user_id: userId,
      tx_hash: txHash || null,
      usdt_amount: usdtAmount || 0,
      credits_granted: amount,
      created_at: new Date().toISOString(),
    },
  });

  return { credits: newBalance, error: null };
}

async function useCredit(userId) {
  const db = getServiceClient();
  if (!db) return { ok: false, error: "Supabase not configured" };

  const current = await getCredits(userId);
  if (current.credits <= 0) return { ok: false, remaining: 0, error: "Sem créditos" };

  const newBalance = current.credits - 1;
  await db.query("aml_credits", {
    method: "POST",
    upsert: true,
    body: { user_id: userId, balance: newBalance, updated_at: new Date().toISOString() },
  });

  return { ok: true, remaining: newBalance, error: null };
}

// --- Reports ---
async function saveReport(userId, reportData) {
  const db = getServiceClient();
  if (!db) return { error: "Supabase not configured" };

  const r = reportData.report || reportData;
  const record = {
    user_id: userId,
    report_id: r.id || `AML-${Date.now().toString(36).toUpperCase()}`,
    address: r.input?.address || r.address || "",
    chain: r.input?.chain || r.network || "",
    risk_level: r.decision?.level || "UNKNOWN",
    risk_score: r.decision?.score || 0,
    data_json: JSON.stringify(reportData),
    report_hash: r.auditTrail?.reportHash || null,
    blockchain_cert: null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await db.query("aml_reports", {
    method: "POST",
    body: record,
  });

  return { report: data?.[0] || record, error: error?.message || null };
}

async function updateReportBlockchain(reportId, blockchainData) {
  const db = getServiceClient();
  if (!db) return { error: "Supabase not configured" };

  await db.query(`aml_reports?report_id=eq.${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    body: {
      blockchain_cert: blockchainData.certificado || null,
      blockchain_data: JSON.stringify(blockchainData),
    },
  });
  return { error: null };
}

async function getUserReports(userId, limit = 20) {
  const db = getServiceClient();
  if (!db) return { reports: [], error: "Supabase not configured" };

  const { data, error } = await db.query("aml_reports", {
    filters: { user_id: userId },
    select: "report_id,address,chain,risk_level,risk_score,blockchain_cert,created_at",
  });

  if (error) return { reports: [], error: error.message };

  // Sort by created_at desc and limit
  const sorted = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
  return { reports: sorted, error: null };
}

async function getReport(reportId) {
  const db = getServiceClient();
  if (!db) return { report: null, error: "Supabase not configured" };

  const { data, error } = await db.query("aml_reports", {
    filters: { report_id: reportId },
    single: true,
  });

  if (error) return { report: null, error: error.message };
  return { report: data, error: null };
}

// --- Check duplicate payment ---
async function isPaymentUsed(txHash) {
  const db = getServiceClient();
  if (!db) return false;

  const { data } = await db.query("aml_payments", {
    filters: { tx_hash: txHash },
  });
  return data && data.length > 0;
}

// --- User profile ---
async function ensureUserRecord(userId, email) {
  const db = getServiceClient();
  if (!db) return;

  await db.query("aml_users", {
    method: "POST",
    upsert: true,
    body: {
      id: userId,
      email: email || "",
      created_at: new Date().toISOString(),
    },
  });
}

// =============================================
// Helpers
// =============================================
async function fetchTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Check if Supabase is configured */
function isConfigured() {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}

module.exports = {
  getServiceClient,
  getAnonClient,
  getCredits,
  addCredits,
  useCredit,
  saveReport,
  updateReportBlockchain,
  getUserReports,
  getReport,
  isPaymentUsed,
  ensureUserRecord,
  isConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
};
