export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/login/index',
    'pages/workStudy/index',
    'pages/workStudyMatch/index',
    'pages/workStudyDetail/index',
    'pages/myApplications/index',
    'pages/mySalaries/index',
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
      {
        pagePath: 'pages/workStudy/index',
        text: '勤工助学',
      },
      {
        pagePath: 'pages/myApplications/index',
        text: '我的申请',
      },
      {
        pagePath: 'pages/mySalaries/index',
        text: '我的薪资',
      },
    ],
  },
});
