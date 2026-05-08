/**
 * Schedule (课表) API client.
 *
 * P2 仅 mock —— 后端真实端点待定（预计 GET /students/{id}/schedule?week=N）。
 * 等接口可用后只替换 fetchSchedule 实现，调用方无感。
 */

export interface ScheduleClass {
  id: string;
  course_name: string;
  teacher: string;
  location: string;
  /** 1=周一, 7=周日 */
  day_of_week: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** "HH:mm" */
  start_time: string;
  end_time: string;
  /** 1-2 / 3-4 / 5-6 / 7-8 / 9-10 / 11 等节次范围，仅展示用 */
  periods: string;
  /** UI 角标颜色 token，避免每个学期都重新算颜色：'blue'|'peach'|'cream'|'warn'|'ok' */
  tone: 'blue' | 'peach' | 'cream' | 'warn' | 'ok';
}

export interface WeekSchedule {
  /** 学期周序号，e.g. 8 */
  week_index: number;
  /** 学期总周数，用于 selector 上限 */
  total_weeks: number;
  classes: ScheduleClass[];
}

const MOCK: WeekSchedule = {
  week_index: 8,
  total_weeks: 18,
  classes: [
    {
      id: 'c1',
      course_name: '高等数学（下）',
      teacher: '王建国',
      location: '主楼 A201',
      day_of_week: 1,
      start_time: '08:00',
      end_time: '09:35',
      periods: '1-2 节',
      tone: 'peach',
    },
    {
      id: 'c2',
      course_name: '大学英语',
      teacher: 'Sarah Chen',
      location: '外语楼 305',
      day_of_week: 1,
      start_time: '10:00',
      end_time: '11:35',
      periods: '3-4 节',
      tone: 'blue',
    },
    {
      id: 'c3',
      course_name: '数据结构',
      teacher: '李梅',
      location: '计算机楼 B102',
      day_of_week: 2,
      start_time: '14:00',
      end_time: '15:35',
      periods: '5-6 节',
      tone: 'cream',
    },
    {
      id: 'c4',
      course_name: '线性代数',
      teacher: '张伟',
      location: '主楼 A105',
      day_of_week: 3,
      start_time: '08:00',
      end_time: '09:35',
      periods: '1-2 节',
      tone: 'warn',
    },
    {
      id: 'c5',
      course_name: '操作系统',
      teacher: '刘强',
      location: '计算机楼 B201',
      day_of_week: 3,
      start_time: '14:00',
      end_time: '15:35',
      periods: '5-6 节',
      tone: 'blue',
    },
    {
      id: 'c6',
      course_name: '体育（篮球）',
      teacher: '陈飞',
      location: '体育馆',
      day_of_week: 4,
      start_time: '10:00',
      end_time: '11:35',
      periods: '3-4 节',
      tone: 'ok',
    },
    {
      id: 'c7',
      course_name: '马克思主义基本原理',
      teacher: '赵敏',
      location: '人文楼 201',
      day_of_week: 5,
      start_time: '08:00',
      end_time: '09:35',
      periods: '1-2 节',
      tone: 'cream',
    },
    {
      id: 'c8',
      course_name: '编译原理',
      teacher: '孙浩',
      location: '计算机楼 B305',
      day_of_week: 5,
      start_time: '14:00',
      end_time: '15:35',
      periods: '5-6 节',
      tone: 'peach',
    },
  ],
};

/**
 * 获取课表。当前返回 mock；待真实接口落地后只改这里。
 *
 * @param _week 默认 当前周。后端用 week index 取数。
 */
export function fetchSchedule(_week?: number): Promise<WeekSchedule> {
  // 真实接口示意：return get<WeekSchedule>('/students/me/schedule', { week });
  return Promise.resolve(MOCK);
}
