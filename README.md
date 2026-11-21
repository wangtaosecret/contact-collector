# 客户联系信息收集网页

一个轻量的客户线索收集站：访客填写联系方式与需求描述，提交后写入 Cloudflare D1，管理员可在后台查看与导出 CSV。

## 技术栈

- **Cloudflare Workers**（运行时代码：`src/index.js`）
- **Cloudflare D1**（数据存储：SQLite，见 `schema.sql`）
- **Workers Assets**（静态页面：`public/`）
- 无框架依赖，纯原生 HTML / CSS / JS

## 功能

### 收集页 `/`
- 姓名（必填）、手机号、邮箱、公司、咨询类型、来源渠道、需求描述（必填）
- 手机号与邮箱**至少填一项**
- 客户端与服务端双重校验（长度、格式、必填项）
- 蜜罐字段反机器人：命中时接口照常返回成功但不落库
- 按 IP 限流：10 分钟内最多 5 次提交
- 提交成功返回可追溯编号（如 `L12`）

### 管理台 `/admin.html`
- 输入管理员令牌后查看全部线索
- 支持按姓名 / 手机 / 邮箱 / 公司 / 留言搜索
- 一键导出 CSV（UTF-8 BOM，Excel 直接打开不乱码；已阻断 `= + - @` 开头的公式注入）

### API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 否 | 健康检查 |
| POST | `/api/submit` | 否 | 提交线索 |
| GET | `/api/leads` | 是 | 读取线索 JSON |
| GET | `/api/leads.csv` | 是 | 导出 CSV |

管理接口鉴权：`Authorization: Bearer <ADMIN_TOKEN>` 或 `X-Admin-Token: <ADMIN_TOKEN>`（恒定时间比较）。

## 本地开发

```bash
npm install
npm run db:init:local   # 建本地 D1 表
npm run dev             # http://localhost:8787
```

本地调试管理接口时，把管理员令牌写入 `.dev.vars`：

```
ADMIN_TOKEN=your-local-token
```

## 部署

```bash
npm install

# 1. 创建 D1（若尚未创建）
npx wrangler d1 create contact-collector-db
#    把输出的 database_id 填进 wrangler.toml

# 2. 建表（远端）
npx wrangler d1 execute contact-collector-db --remote --file=./schema.sql

# 3. 设置管理员令牌（作为 Worker secret，不进代码库）
npx wrangler secret put ADMIN_TOKEN

# 4. 发布
npx wrangler deploy
```

部署完成后：

- 收集页：`https://contact-collector.<你的子域>.workers.dev`
- 管理台：`https://contact-collector.<你的子域>.workers.dev/admin.html`

## 配置说明

`wrangler.toml` 中：

- `[[d1_databases]]` — `binding = "DB"` 对应代码里的 `env.DB`
- `[assets]` — `binding = "ASSETS"` 对应代码里的 `env.ASSETS`，`not_found_handling = "none"` 让未匹配路径回落到 Worker 逻辑
- `ADMIN_TOKEN` **不写在 `wrangler.toml`**，通过 `wrangler secret put` 设置

## 安全说明

- 管理员令牌使用 Worker secret 存储，不落代码库
- 所有用户输入在服务端做长度截断与控制字符剥离
- 响应统一带 `CSP` / `X-Content-Type-Options` / `X-Frame-Options` 等安全头
- 管理接口采用恒定时间比较，避免计时侧信道
- CSV 导出阻断公式注入
- 蜜罐 + IP 限流作为基础反垃圾手段

生产环境建议进一步接入 Cloudflare Turnstile 做验证码，并在数据库层增加线索去重与脱敏策略。

## 隐私

表单收集的联系方式仅用于业务沟通。请在正式上线前根据实际合规要求补充隐私政策页面与用户告知。

## License

MIT
