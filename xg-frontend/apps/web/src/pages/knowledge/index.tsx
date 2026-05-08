import { useState } from 'react';
import { Input, Spin, Tag } from 'antd';
import { message } from '@/utils/antdApp';
import {
  LikeOutlined,
  DislikeOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { describeApiError } from '@/utils/api-error';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { QAItem } from '@/api/knowledge';
import { askQuestion, getQAHistory, submitFeedback } from '@/api/knowledge';
import styles from './index.module.css';

const CATEGORY_LABELS: Record<string, string> = {
  scholarship: '奖学金',
  financial_aid: '助学金',
  regulation: '规章制度',
  procedure: '办事流程',
  general: '综合',
};

export default function KnowledgeBase() {
  const [currentAnswer, setCurrentAnswer] = useState<QAItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const askMutation = useMutation({
    mutationFn: askQuestion,
    onSuccess: (data) => {
      setCurrentAnswer(data);
    },
    onError: (e: unknown) => message.error(describeApiError(e, '查询失败，请稍后重试')),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, helpful }: { id: string; helpful: boolean }) =>
      submitFeedback(id, helpful),
    onSuccess: (_data, variables) => {
      if (currentAnswer && currentAnswer.id === variables.id) {
        setCurrentAnswer({ ...currentAnswer, helpful: variables.helpful });
      }
      message.success('感谢反馈');
    },
    onError: (e: unknown) => message.error(describeApiError(e, '反馈提交失败')),
  });

  const { data: historyData } = useQuery({
    queryKey: ['qaHistory', { page: 1, size: 10 }],
    queryFn: () => getQAHistory({ page: 1, size: 10 }),
  });

  const handleSearch = (value: string) => {
    const q = value.trim();
    if (!q) return;
    askMutation.mutate({ question: q });
  };

  const handleFeedback = (helpful: boolean) => {
    if (!currentAnswer) return;
    feedbackMutation.mutate({ id: currentAnswer.id, helpful });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>知识问答</h1>
      </div>

      <div className={styles.searchArea}>
        <Input.Search
          size="large"
          placeholder="输入问题，查询校规政策..."
          enterButton="提问"
          loading={askMutation.isPending}
          onSearch={handleSearch}
          disabled={askMutation.isPending}
        />
      </div>

      {askMutation.isPending ? (
        <div className={styles.loadingArea}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: 'var(--fg-3)', fontSize: 14 }}>正在查找答案...</div>
        </div>
      ) : currentAnswer ? (
        <div className={styles.answerCard}>
          <div className={styles.answerQuestion}>{currentAnswer.question}</div>
          {currentAnswer.category && (
            <Tag color="blue" style={{ marginBottom: 12 }}>
              {CATEGORY_LABELS[currentAnswer.category] ?? currentAnswer.category}
            </Tag>
          )}
          <div className={styles.answerContent}>{currentAnswer.answer}</div>
          <div className={styles.answerMeta}>
            <div className={styles.sources}>
              {currentAnswer.sources && currentAnswer.sources.length > 0 && (
                <>
                  <span>来源：</span>
                  {currentAnswer.sources.map((s) => (
                    <Tag key={s} className={styles.sourceTag}>
                      {s}
                    </Tag>
                  ))}
                </>
              )}
            </div>
            <div className={styles.feedback}>
              <button
                className={`${styles.feedbackBtn} ${currentAnswer.helpful === true ? styles.active : ''}`}
                onClick={() => handleFeedback(true)}
                disabled={feedbackMutation.isPending}
              >
                <LikeOutlined />
                有帮助
              </button>
              <button
                className={`${styles.feedbackBtn} ${currentAnswer.helpful === false ? styles.active : ''}`}
                onClick={() => handleFeedback(false)}
                disabled={feedbackMutation.isPending}
              >
                <DislikeOutlined />
                没帮助
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.emptyAnswer}>
          <div className={styles.emptyIcon}>
            <MessageOutlined />
          </div>
          <div>输入问题开始查询</div>
        </div>
      )}

      {historyData && historyData.data.length > 0 && (
        <div>
          <div className={styles.historyTitle}>历史记录</div>
          <div className={styles.historyList}>
            {historyData.data.map((item) => (
              <div
                key={item.id}
                className={styles.historyItem}
                onClick={() => toggleExpand(item.id)}
              >
                <div className={styles.historyQuestion}>{item.question}</div>
                {expandedId === item.id ? (
                  <div
                    className={styles.answerContent}
                    style={{ marginTop: 8, fontSize: 13 }}
                  >
                    {item.answer}
                  </div>
                ) : (
                  <div className={styles.historyAnswer}>{item.answer}</div>
                )}
                <div className={styles.historyTime}>
                  {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
