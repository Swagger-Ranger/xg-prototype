// 补抓:系统设置走 ?tab= query 才对,前面的脚本走错路径都掉到默认 tab 了。
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(__dirname, 'screenshots');
const FRONTEND = 'http://localhost:5173';
const BACKEND = 'http://localhost:8080';
const TENANT = 'default';

async function login(username, password) {
  const res = await fetch(`${BACKEND}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (body.code !== 'SUCCESS') throw new Error(`login fail: ${JSON.stringify(body)}`);
  return body.data;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const auth = await login('admin1', 'xg@123456');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(({ token, user }) => {
    localStorage.setItem('xg_token', token);
    localStorage.setItem('xg_user', JSON.stringify(user));
  }, { token: auth.token, user: auth.user });
  const page = await ctx.newPage();

  const targets = [
    { url: '/system?tab=users',    file: 'system_users.png' },
    { url: '/system?tab=roles',    file: 'system_roles_permissions.png' },
    { url: '/system?tab=org',      file: 'system_org_assignment.png' },
    { url: '/system?tab=settings', file: 'system_settings.png' },
    { url: '/system?tab=notif',    file: 'system_notification_center.png' },
    { url: '/system?tab=ai',       file: 'system_ai_metrics.png' },
    { url: '/system?tab=kb',       file: 'system_knowledge_base.png' },
    { url: '/leave?tab=return',    file: 'leave_config_return_tab.png' },
    { url: '/leave?tab=notice',    file: 'leave_config_notice_tab.png' },
  ];

  for (const t of targets) {
    console.log(`→ ${t.file}  (${t.url})`);
    try {
      await page.goto(`${FRONTEND}${t.url}`, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
      console.warn(`   goto fail: ${e.message}`);
    }
    await page.waitForTimeout(2500);
    try {
      await page.screenshot({ path: join(SHOTS_DIR, t.file), fullPage: true });
      console.log(`   ✓ ${t.file}`);
    } catch (e) {
      console.warn(`   shot fail: ${e.message}`);
    }
  }

  // dean 视角看 work-study
  const dean = await login('dean1', 'xg@123456');
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx2.addInitScript(({ token, user }) => {
    localStorage.setItem('xg_token', token);
    localStorage.setItem('xg_user', JSON.stringify(user));
  }, { token: dean.token, user: dean.user });
  const page2 = await ctx2.newPage();
  for (const t of [
    { url: '/work-study',            file: 'workstudy_dashboard.png' },
    { url: '/work-study?tab=positions', file: 'workstudy_positions.png' },
    { url: '/work-study?tab=applications', file: 'workstudy_applications.png' },
    { url: '/work-study?tab=salary', file: 'workstudy_salary.png' },
  ]) {
    console.log(`→ ${t.file}  (${t.url})`);
    try {
      await page2.goto(`${FRONTEND}${t.url}`, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
      console.warn(`   goto fail: ${e.message}`);
    }
    await page2.waitForTimeout(2500);
    try {
      await page2.screenshot({ path: join(SHOTS_DIR, t.file), fullPage: true });
      console.log(`   ✓ ${t.file}`);
    } catch (e) {
      console.warn(`   shot fail: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\nAll done.');
})();
