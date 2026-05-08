export default defineAppConfig({
  pages: [
    'pages/home/index',           // Tab 1 入口（替代旧 pages/index）
    'pages/apps/index',           // Tab 2 应用 launcher
    'pages/profile/index',        // Tab 3 个人中心
    'pages/login/index',
    // 业务页（不在 tabBar，从 apps 或首页进入）
    'pages/leave/list/index',
    'pages/leave/detail/index',
    'pages/leave/apply/index',
    'pages/leave/approval/index',
    'pages/leave/class/index',
    'pages/schedule/index',
    'pages/workStudy/index',
    'pages/workStudyMatch/index',
    'pages/workStudyDetail/index',
    'pages/myWorkStudy/index',
    'pages/myProfile/index',
    'pages/notifications/index',
  ],
  // 同声传译插件 + 录音权限：等 mp 后台开通插件、并把开发者微信号加进去后再启用。
  // 当前注释掉以让模拟器能正常启动；AI 页面里 requirePlugin 已 try/catch，无插件时只是按
  // 麦克风时提示"语音插件未加载"，不影响其他功能。
  //
  // plugins: {
  //   WechatSI: { version: 'latest', provider: 'wx069ba97219f66d99' },
  // },
  // permission: {
  //   'scope.record': { desc: '用于 AI 助手语音输入' },
  // },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '朝夕',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f6f5f4',
  },
  tabBar: {
    custom: true, // 自定义 tab bar 在 src/custom-tab-bar/ ——中央带 AI 按钮
    color: '#615d59',
    selectedColor: '#0075de',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/home/index',
        text: '首页',
      },
      {
        pagePath: 'pages/apps/index',
        text: '应用',
      },
      {
        pagePath: 'pages/profile/index',
        text: '个人中心',
      },
    ],
  },
});
