/**
 * 客户联系信息收集 Worker
 *
 * 路由：
 *   POST /api/submit       提交客户信息（写入 D1）
 *   GET  /api/leads        读取全部线索（需管理员令牌）
 *   GET  /api/leads.csv    导出 CSV（需管理员令牌）
 *   GET  /api/health       健康检查
 *
 * 静态页面（首页表单、/admin 管理台）由 assets 绑定提供。
 */

const LIMITS = {
  name: 80,
  phone: 40,
  email: 160,
  company: 120,
  message: 2000,
  source: 60,
  topic: 40,
};

const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const rateBuckets = new Map();

const SECURITY_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });
}

/** 清理用户输入：去首尾空白、去掉控制字符、限长 */
function clean(value, max) {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return stripped.length > max ? stripped.slice(0, max) : stripped;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function isPhone(v) {
  // 允许手机号、座机、含空格/连字符的常见写法
  return /^[0-9+\-() ]{6,40}$/.test(v);
}

function clientIp(request) {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) return cf;
  return request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

/** 简单的按 IP 限流，避免表单被刷 */
function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_LIMIT.windowMs) {
    rateBuckets.set(ip, { start: now, count: 1 });
    if (rateBuckets.size > 5000) {
      for (const [key, val] of rateBuckets) {
        if (now - val.start > RATE_LIMIT.windowMs) rateBuckets.delete(key);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT.max;
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  // 前导 = + - @ 会被表格软件当公式，加前缀单引号阻断
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function handleSubmit(request, env) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return json({ ok: false, error: "提交过于频繁，请稍后再试" }, 429);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "请求格式不正确" }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "请求格式不正确" }, 400);
  }

  // 蜜罐字段：正常用户看不到，机器人会填
  if (clean(payload.website, 200)) {
    return json({ ok: true, ref: "L-hidden" }, 200);
  }

  const name = clean(payload.name, LIMITS.name);
  const phone = clean(payload.phone, LIMITS.phone);
  const email = clean(payload.email, LIMITS.email);
  const company = clean(payload.company, LIMITS.company);
  const message = clean(payload.message, LIMITS.message);
  const source = clean(payload.source, LIMITS.source);
  const topic = clean(payload.topic, LIMITS.topic);

  if (!name) return json({ ok: false, error: "请填写您的姓名" }, 400);
  if (!phone && !email) {
    return json({ ok: false, error: "请至少留下手机号或邮箱其中一种联系方式" }, 400);
  }
  if (phone && !isPhone(phone)) {
    return json({ ok: false, error: "手机号格式不正确" }, 400);
  }
  if (email && !isEmail(email)) {
    return json({ ok: false, error: "邮箱格式不正确" }, 400);
  }
  if (!message) return json({ ok: false, error: "请简单描述一下您的需求" }, 400);

  const createdAt = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO leads (name, phone, email, company, topic, message, source, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, phone || null, email || null, company || null, topic || null, message, source || null, ip, createdAt);

  let result;
  try {
    result = await env.DB.prepare(
      `INSERT INTO leads (name, phone, email, company, topic, message, source, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, phone || null, email || null, company || null, topic || null, message, source || null, ip, createdAt).run();
  } catch (err) {
    console.error("D1 insert failed:", err && err.message);
    return json({ ok: false, error: "提交失败，请稍后重试" }, 500);
  }

  const id = result?.meta?.last_row_id;
  const ref = id ? `L${id}` : "L-ok";
  console.log(`lead saved ref=${ref} topic=${topic || "-"} ip=${ip}`);
  return json({ ok: true, ref, createdAt }, 201);
}

function authorized(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const direct = request.headers.get("x-admin-token") || "";
  const provided = bearer || direct;
  if (!provided) return false;
  // 恒定时间比较，避免计时侧信道
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

async function handleLeads(request, env, asCsv) {
  if (!env.ADMIN_TOKEN) {
    return json({ ok: false, error: "管理员令牌未配置" }, 503);
  }
  if (!authorized(request, env)) {
    return json({ ok: false, error: "未授权" }, 401);
  }

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT id, name, phone, email, company, topic, message, source, ip, created_at
       FROM leads ORDER BY id DESC LIMIT 1000`
    ).all();
  } catch (err) {
    console.error("D1 select failed:", err && err.message);
    return json({ ok: false, error: "读取失败" }, 500);
  }

  const leads = rows?.results || [];
  if (!asCsv) {
    return json({ ok: true, count: leads.length, leads });
  }

  const header = ["编号", "姓名", "手机", "邮箱", "公司", "咨询类型", "留言", "来源", "提交时间"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of leads) {
    lines.push(
      [r.id, r.name, r.phone, r.email, r.company, r.topic, r.message, r.source, r.created_at]
        .map(csvCell)
        .join(",")
    );
  }
  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/api/health") {
        return json({ ok: true, service: "contact-collector", time: new Date().toISOString() });
      }

      if (path === "/api/submit") {
        if (request.method !== "POST") {
          return json({ ok: false, error: "仅支持 POST" }, 405);
        }
        return await handleSubmit(request, env);
      }

      if (path === "/api/leads") {
        return await handleLeads(request, env, false);
      }

      if (path === "/api/leads.csv") {
        return await handleLeads(request, env, true);
      }

      // 其余路径交给静态资源绑定
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ ok: false, error: "Not Found" }, 404);
    } catch (err) {
      console.error("unhandled error:", err && err.stack);
      return json({ ok: false, error: "服务器内部错误" }, 500);
    }
  },
};
