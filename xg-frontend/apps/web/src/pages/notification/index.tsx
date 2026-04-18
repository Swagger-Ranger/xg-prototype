import { useState } from 'react';
import { Badge, Button, Form, Input, Modal, Select, Segmented, message, Spin, Empty } from 'antd';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Notification, SendNotificationData } from '@/api/notification';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  confirmNotification,
  sendNotification,
} from '@/api/notification';
import { useAuth } from '@/hooks/useAuth';
import styles from './index.module.css';

type TabKey = 'all' | 'unread' | 'read';

const PAGE_SIZE = 20;

export default function NotificationPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const { hasPermission } = useAuth();
  const canSend = hasPermission('notification:send');

  const [sendForm] = Form.useForm<SendNotificationData>();
  const queryClient = useQueryClient();

  const queryParams = { page, size: PAGE_SIZE };

  const { data, isFetching } = useQuery({
    queryKey: ['myNotifications', queryParams],
    queryFn: () => getMyNotifications(queryParams),
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: getUnreadCount,
    refetchInterval: 60000,
  });

  const readMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['notificationUnreadCount'] });
    },
    onError: () => {
      message.error('操作失败，请重试');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmNotification,
    onSuccess: () => {
      message.success('已确认');
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
    },
    onError: () => {
      message.error('确认失败，请重试');
    },
  });

  const sendMutation = useMutation({
    mutationFn: sendNotification,
    onSuccess: () => {
      message.success('通知已发送');
      setSendOpen(false);
      sendForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
    },
    onError: () => {
      message.error('发送通知失败，请重试');
    },
  });

  const handleRowClick = (item: Notification) => {
    setExpanded(expanded === item.id ? null : item.id);
    if (!item.read) {
      readMutation.mutate(item.id);
    }
  };

  const allItems = data?.data ?? [];

  const filteredItems = allItems.filter((item) => {
    if (tab === 'unread') return !item.read;
    if (tab === 'read') return item.read;
    return true;
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {canSend ? '通知任务' : '我的通知'}
          {unreadCount > 0 && (
            <Badge count={unreadCount} className={styles.badge} />
          )}
        </h1>
        {canSend && (
          <Button type="primary" onClick={() => setSendOpen(true)}>
            发送通知
          </Button>
        )}
      </div>

      <Modal
        title="发送通知"
        open={sendOpen}
        onCancel={() => { setSendOpen(false); sendForm.resetFields(); }}
        onOk={() => sendForm.submit()}
        okText="发送"
        cancelText="取消"
        confirmLoading={sendMutation.isPending}
      >
        <Form
          form={sendForm}
          layout="vertical"
          initialValues={{ priority: 'normal', type: 'system' }}
          onFinish={(values) => sendMutation.mutate(values)}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="通知标题" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <Input.TextArea rows={4} placeholder="通知内容" />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select>
              <Select.Option value="system">系统通知</Select.Option>
              <Select.Option value="workflow">工作流通知</Select.Option>
              <Select.Option value="reminder">提醒</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="优先级">
            <Select>
              <Select.Option value="normal">普通</Select.Option>
              <Select.Option value="urgent">紧急</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Segmented
        className={styles.segmented}
        options={[
          { label: '全部', value: 'all' },
          { label: '未读', value: 'unread' },
          { label: '已读', value: 'read' },
        ]}
        value={tab}
        onChange={(v) => { setTab(v as TabKey); setPage(1); }}
      />

      <div className={styles.listCard}>
        {isFetching ? (
          <div className={styles.center}><Spin /></div>
        ) : filteredItems.length === 0 ? (
          <div className={styles.center}><Empty description="暂无通知" /></div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className={`${styles.row} ${!item.read ? styles.unread : ''} ${expanded === item.id ? styles.rowExpanded : ''}`}
              onClick={() => handleRowClick(item)}
            >
              <div className={styles.rowMain}>
                <span
                  className={styles.dot}
                  style={{ background: item.priority === 'urgent' ? 'var(--danger)' : 'var(--fg-4)' }}
                />
                <div className={styles.rowContent}>
                  <div className={styles.rowTitle}>{item.title}</div>
                  <div className={styles.rowPreview}>
                    {expanded === item.id ? item.content : (item.content ?? '').slice(0, 60) + ((item.content ?? '').length > 60 ? '…' : '')}
                  </div>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.rowTime}>{dayjs(item.created_at).format('MM-DD HH:mm')}</span>
                  {!item.read && <span className={styles.unreadDot} />}
                </div>
              </div>

              {expanded === item.id && !item.confirmed && (
                <div
                  className={styles.rowActions}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="small"
                    type="primary"
                    loading={confirmMutation.isPending}
                    onClick={() => confirmMutation.mutate(item.id)}
                  >
                    确认
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {(data?.total ?? 0) > PAGE_SIZE && (
        <div className={styles.pagination}>
          <Button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            size="small"
          >
            上一页
          </Button>
          <span className={styles.pageInfo}>第 {page} 页 / 共 {Math.ceil((data?.total ?? 0) / PAGE_SIZE)} 页</span>
          <Button
            disabled={page * PAGE_SIZE >= (data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
            size="small"
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
