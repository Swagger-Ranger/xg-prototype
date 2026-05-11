// 朝夕系统介绍 PDF 自动截图脚本
//
// 流程:
//   1. 调 /api/v1/auth/login 拿 token + user
//   2. Playwright 启 chromium,把 token+user 注入 localStorage (跟前端 auth.store 一致)
//   3. 顺次 goto 一组 URL,等元素稳定再 screenshot
//   4. 输出到 docs/screenshots/<name>.png
//
// 跑法: cd /Users/yx/xg1/docs && node capture-screenshots.mjs
//
// 失败安全:每张图独立 try-catch,某张失败不影响后面继续。
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(__dirname, 'screenshots');
const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:8080';
const TENANT = 'default';
const VIEWPORT = { width: 1440, height: 900 };

if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true });

const ACCOUNTS = {
  counselor: { username: 'counselor_li', password: 'xg@123456' },
  student:   { username: 'stu_zhang',    password: 'xg@123456' },
  dean:      { username: 'dean1',        password: 'xg@123456' },
  admin:     { username: 'admin1',       password: 'xg@123456' },
  officer:   { username: 'officer1',     password: 'xg@123456' },
};

async function login({ username, password }) {
  const res = await fetch(`${BACKEND}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (body.code !== 'SUCCESS') throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.data; // { token, user }
}

async function shot(page, url, file, opts = {}) {
  const path = join(SHOTS_DIR, file);
  console.log(`→ ${file}  (${url})`);
  try {
    await page.goto(`${FRONTEND}${url}`, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.warn(`   goto fail: ${e.message}`);
  }
  // 让 React Query / 数据请求落地
  await page.waitForTimeout(opts.wait ?? 2500);
  // 关掉可能跳出的引导/提示
  await page.evaluate(() => {
    document.querySelectorAll('.ant-tour-mask, .ant-modal-mask').forEach((n) => n.remove());
  }).catch(() => {});
  try {
    await page.screenshot({ path, fullPage: !!opts.fullPage });
    console.log(`   ✓ ${path}`);
  } catch (e) {
    console.warn(`   shot fail: ${e.message}`);
  }
}

async function withRole(browser, role, fn) {
  const acct = ACCOUNTS[role];
  console.log(`\n=== Login as ${role} (${acct.username}) ===`);
  const auth = await login(acct);
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript(({ token, user }) => {
    try {
      localStorage.setItem('xg_token', token);
      localStorage.setItem('xg_user', JSON.stringify(user));
    } catch {}
  }, { token: auth.token, user: auth.user });
  const page = await ctx.newPage();
  try {
    await fn(page);
  } finally {
    await ctx.close();
  }
}

// 路径来自 web/App.tsx — 实际是单数: /student / /leave / /notification 等
// /leave-config 是个重定向器,直接走 /leave?tab=rule 拿配置页
const targets = {
  counselor: [
    { url: '/workspace',         file: 'counselor_workspace.png',  fullPage: true },
    { url: '/student',           file: 'students_list.png' },
    { url: '/student/fields',    file: 'student_fields.png' },
    { url: '/student/3200',      file: 'student_profile.png',      fullPage: true },
    { url: '/leave',             file: 'leaves_admin.png',         fullPage: true },
    { url: '/leave?tab=rule',    file: 'leave_config_rule.png',    fullPage: true },
    { url: '/leave?tab=return',  file: 'leave_config_return.png',  fullPage: true },
    { url: '/alerts',            file: 'alerts_list.png' },
    { url: '/work-study',        file: 'workstudy_admin.png',      fullPage: true },
    { url: '/notification',      file: 'notifications_admin.png',  fullPage: true },
    { url: '/violation',         file: 'violations_list.png' },
    { url: '/counselor-talks',   file: 'counselor_talks.png' },
    { url: '/workflows',         file: 'workflows_list.png' },
  ],
  student: [
    { url: '/workspace',         file: 'student_workspace.png',    fullPage: true },
    { url: '/leave',             file: 'student_leaves.png',       fullPage: true },
  ],
  dean: [
    { url: '/workspace',         file: 'dean_workspace.png',       fullPage: true },
    { url: '/leave',             file: 'dean_leaves.png',          fullPage: true },
  ],
  admin: [
    { url: '/workspace',         file: 'admin_workspace.png',      fullPage: true },
    { url: '/system/roles',      file: 'roles_management.png',     fullPage: true },
    { url: '/leave?tab=rule',    file: 'admin_leave_config.png',   fullPage: true },
  ],
};

// === 交互式截图 (需要点击 / 输入才能看到的页面) ===
// 顺次:打开页面 → 等数据 → 触发交互 → 等新元素 → 截图
async function interactiveShots(browser) {
  console.log('\n=== Interactive shots (counselor) ===');
  await withRole(browser, 'counselor', async (page) => {

    // 1) 请假详情 drawer — 点行内"查看"链接
    await page.goto(`${FRONTEND}/leave`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    try {
      const viewLink = page.locator('button:has-text("查看")').first();
      await viewLink.click({ timeout: 3000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(SHOTS_DIR, 'leave_detail_drawer.png'), fullPage: false });
      console.log('   ✓ leave_detail_drawer.png');
      // 关掉抽屉再下一步
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    } catch (e) {
      console.warn('   leave detail fail:', e.message);
    }

    // 2) 学生画像 - 行为 tab (含事件时间线 + 违纪 + 处分)
    await page.goto(`${FRONTEND}/student/3200`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    try {
      const behaviorTab = page.locator('[role="tab"]:has-text("行为")').first();
      await behaviorTab.click({ timeout: 2000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(SHOTS_DIR, 'student_behavior_tab.png'), fullPage: true });
      console.log('   ✓ student_behavior_tab.png');
    } catch (e) {
      console.warn('   student behavior tab fail:', e.message);
    }

    // 3) 学生画像 - AI 洞察 tab
    try {
      const aiTab = page.locator('[role="tab"]:has-text("AI 洞察")').first();
      await aiTab.click({ timeout: 2000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: join(SHOTS_DIR, 'student_ai_insight.png'), fullPage: true });
      console.log('   ✓ student_ai_insight.png');
    } catch (e) {
      console.warn('   student AI tab fail:', e.message);
    }

    // 4) AI 面板对话 — 在学生信息库页问"2024 级人工智能专业的学生"
    //    选这个 query 是因为不依赖"博雅书院"(单轨学校没有,LLM 跳过),纯学院/专业/年级
    await page.goto(`${FRONTEND}/student`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500);
    try {
      const inp = page.locator('input[placeholder="输入消息..."]').first();
      await inp.fill('2024 级 人工智能 专业的学生', { timeout: 3000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(SHOTS_DIR, 'ai_panel_input.png'), fullPage: false });
      console.log('   ✓ ai_panel_input.png');
      await inp.press('Enter');
      // 等 LLM tool-call 回来 + 前端 action 应用
      await page.waitForTimeout(12000);
      await page.screenshot({ path: join(SHOTS_DIR, 'ai_panel_filtered.png'), fullPage: false });
      console.log('   ✓ ai_panel_filtered.png');
    } catch (e) {
      console.warn('   AI typing fail:', e.message);
    }

    // 5) AI 面板 - 知识问答 (在工作台问个政策问题,期待 RAG 走起来)
    await page.goto(`${FRONTEND}/workspace`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);
    try {
      const inp = page.locator('input[placeholder="输入消息..."]').first();
      await inp.fill('国家奖学金的评选条件是什么', { timeout: 3000 });
      await inp.press('Enter');
      await page.waitForTimeout(15000); // 等 RAG + LLM
      await page.screenshot({ path: join(SHOTS_DIR, 'ai_panel_rag.png'), fullPage: false });
      console.log('   ✓ ai_panel_rag.png');
    } catch (e) {
      console.warn('   AI RAG fail:', e.message);
    }

    // 4) 系统设置子 tab (角色 / 用户分别截)
    for (const sub of ['users', 'roles', 'permissions', 'tenants']) {
      try {
        await page.goto(`${FRONTEND}/system/${sub}`, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(SHOTS_DIR, `system_${sub}.png`), fullPage: true });
        console.log(`   ✓ system_${sub}.png`);
      } catch (e) {
        console.warn(`   /system/${sub} fail:`, e.message);
      }
    }

    // 5) 工作流引擎页面
    try {
      await page.goto(`${FRONTEND}/workflows`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(SHOTS_DIR, 'workflows.png'), fullPage: true });
      console.log('   ✓ workflows.png');
    } catch (e) {
      console.warn('   workflows fail:', e.message);
    }
  });

  // 6) 校管理员 — 系统配置页
  console.log('\n=== Interactive shots (admin) ===');
  await withRole(browser, 'admin', async (page) => {
    for (const sub of ['users', 'roles', 'permissions', 'tenants', 'audit']) {
      try {
        await page.goto(`${FRONTEND}/system/${sub}`, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForTimeout(2000);
        await page.screenshot({ path: join(SHOTS_DIR, `admin_system_${sub}.png`), fullPage: true });
        console.log(`   ✓ admin_system_${sub}.png`);
      } catch (e) {
        console.warn(`   admin/system/${sub} fail:`, e.message);
      }
    }
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [role, list] of Object.entries(targets)) {
      await withRole(browser, role, async (page) => {
        for (const t of list) {
          await shot(page, t.url, t.file, { fullPage: t.fullPage });
        }
      });
    }
    await interactiveShots(browser);
  } finally {
    await browser.close();
  }
  console.log('\nAll done. Files in', SHOTS_DIR);
})();
