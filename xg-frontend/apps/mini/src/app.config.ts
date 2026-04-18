export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/login/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#6366f1',
    navigationBarTitleText: '学工管理',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f3ff',
  },
  tabBar: {
    custom: true,
    color: '#9ca3af',
    selectedColor: '#6366f1',
    backgroundColor: '#ffffff',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
      },
    ],
  },
});
