import type { UserConfigExport } from '@tarojs/cli';

export default {
  env: {
    NODE_ENV: '"development"',
  },
  defineConstants: {
    'process.env.XG_API_BASE_URL': JSON.stringify('http://localhost:8080/api/v1'),
    'process.env.XG_AI_BASE_URL': JSON.stringify('http://localhost:8001/api/v1'),
  },
  mini: {},
} satisfies UserConfigExport;
