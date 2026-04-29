import type { UserConfigExport } from '@tarojs/cli';

/**
 * Production base URLs — REPLACE before publishing the mini-program.
 * The values must be HTTPS and registered in 微信小程序后台 → 服务器域名.
 */
export default {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {
    'process.env.XG_API_BASE_URL': JSON.stringify('https://api.example.com/api/v1'),
    'process.env.XG_AI_BASE_URL': JSON.stringify('https://ai.example.com/api/v1'),
  },
  mini: {},
} satisfies UserConfigExport;
