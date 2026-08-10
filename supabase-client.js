/**
 * ============================================================
 * Supabase 连线设定
 * ============================================================
 * 把下面两个值换成你自己 Supabase 项目的：
 * - SUPABASE_URL：Project Settings → API → Project URL
 * - SUPABASE_PUBLISHABLE_KEY：Project Settings → API Keys → Publishable key
 *   （旧版界面叫 anon / public key，效果一样）
 *
 * ⚠️ 这个 key 是设计成可以放在前端公开代码里的，不是密码，
 * 真正的权限边界是我们在数据库那边设定的 Row Level Security（RLS）规则。
 * 千万不要把 service_role / secret key 放在这个文件或任何前端代码里。
 */
const SUPABASE_URL = 'https://lovjfoqyctztkqjgxfan.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C4kyQrR9XzP_2w-OPj5nfQ_DLSv59IP';

// 建立全局唯一的 Supabase client，整个 app.js 都透过这个变量存取数据库/登录
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
