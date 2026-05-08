import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, Textarea, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import {
  getLeaveDetail,
  getLeaveTypes,
  getLeaveImpact,
  returnByLocation,
  applyManualReturn,
  withdrawLeave,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_TONES,
  type LeaveRequest,
  type LeaveTypeConfig,
  type LeaveExtraField,
  type LeaveImpactView,
} from '../../../api/leave';
import { approveTask, rejectTask } from '../../../api/workflow';
import { polishRejection } from '../../../api/ai';
import styles from './index.module.css';

/* 请假详情 — Apple 玻璃感 × Detail archetype。
 *
 * 双角色复用：
 *   · 学生（无 taskId 参数）：基本信息 / 附加表单 / 定位 + 撤回 / 销假
 *   · 审批人（带 taskId 参数）：同样信息 + 批准 / 驳回（含 AI 改写底栏）
 */

function formatDateTime(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatExtraValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join('、') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function LeaveDetailPage() {
  const router = useRouter();
  const id = String(router.params.id ?? '');
  const taskId = String(router.params.taskId ?? '');
  const isApprover = !!taskId;

  const [record, setRecord] = useState<LeaveRequest | null>(null);
  const [typeConfig, setTypeConfig] = useState<LeaveTypeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // ── 驳回底栏状态 ─────────────────────────────────────
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  // 改写前原稿，方便一键撤销；为 null 表示从未改写或已手动编辑（提交新稿）
  const [polishOriginal, setPolishOriginal] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);

  // ── 人工销假申请底栏(GPS 不命中时的兜底通道)─────
  const [manualOpen, setManualOpen] = useState(false);
  const [manualReason, setManualReason] = useState('');

  // ── 影响课程（仅审批人模式可见）────────────────────
  const [impact, setImpact] = useState<LeaveImpactView | null>(null);
  const [impactExpanded, setImpactExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // impact 仅审批人需要：背景拉，不阻塞详情主体；失败静默（zero 视图也行）
      const impactP = isApprover
        ? getLeaveImpact(id).catch(() => null as LeaveImpactView | null)
        : Promise.resolve(null);

      const [detail, types, impactRes] = await Promise.all([
        getLeaveDetail(id),
        getLeaveTypes().catch(() => [] as LeaveTypeConfig[]),
        impactP,
      ]);
      setRecord(detail);
      const cfg = types.find((t) => t.code === detail.leave_type_code) ?? null;
      setTypeConfig(cfg);
      if (impactRes) setImpact(impactRes);
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  }, [id, isApprover]);

  useEffect(() => {
    load();
  }, [load]);

  const onWithdraw = () => {
    if (!record) return;
    Taro.showModal({
      title: '确认撤回',
      content: '撤回后该申请将作废，可重新提交。',
      confirmText: '确定撤回',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        setBusy(true);
        try {
          await withdrawLeave(record.id);
          Taro.showToast({ title: '已撤回', icon: 'success' });
          setTimeout(() => Taro.navigateBack(), 600);
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '撤回失败', icon: 'none' });
          setBusy(false);
        }
      },
    });
  };

  /**
   * 销假主入口(改造后):学生点「我已返校」→ GPS 命中即销;不命中
   * 弹页给两条路 — 重新定位 / 申请人工销假。原来的 leave_return workflow
   * 已废弃,不再有"销假表单字段"这种概念。
   */
  const onCancel = () => {
    if (!record) return;
    Taro.showModal({
      title: '我已返校',
      content: '将根据当前 GPS 自动判断是否在校园内,在校园内立即销假。',
      confirmText: '获取定位',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        await trySubmitByLocation();
      },
    });
  };

  const captureLocation = (): Promise<{ latitude: number; longitude: number; capturedAt: string } | null> =>
    new Promise((resolve) => {
      Taro.getLocation({
        type: 'gcj02',
        success: (r) => resolve({
          latitude: r.latitude,
          longitude: r.longitude,
          capturedAt: new Date().toISOString(),
        }),
        fail: () => resolve(null),
      });
    });

  /** GPS 销假主链路:拉位置 → 调 by-location → 命中即 toast / 不命中弹拒绝页 */
  const trySubmitByLocation = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const loc = await captureLocation();
      if (!loc) {
        Taro.showToast({ title: '未获取到 GPS,请检查定位权限', icon: 'none' });
        return;
      }
      const res = await returnByLocation(record.id, loc.latitude, loc.longitude, loc.capturedAt);
      if (res.inFence) {
        Taro.showToast({ title: '销假成功', icon: 'success' });
        await load();
      } else {
        showOutOfFenceModal(res.distanceMeters, res.radiusMeters);
      }
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '销假失败', icon: 'none' });
    } finally {
      setBusy(false);
    }
  };

  /** GPS 不在校园内 — 给学生两条路:重新定位 或 申请人工销假。 */
  const showOutOfFenceModal = (distM: number, radiusM: number) => {
    Taro.showModal({
      title: '不在校园内',
      content: `距校园中心 ${distM.toFixed(0)} 米(围栏 ${radiusM} 米)。可以「重新定位」再试一次,或「申请人工销假」由辅导员审核。`,
      confirmText: '重新定位',
      cancelText: '人工销假',
      // 微信将 cancel 渲染在左,confirm 在右 — 主操作给重新定位
      success: (r) => {
        if (r.confirm) {
          trySubmitByLocation();
        } else if (r.cancel) {
          setManualReason('');
          setManualOpen(true);
        }
      },
    });
  };

  /** 提交人工销假申请(GPS 兜底通道)。 */
  const submitManualApply = async () => {
    if (!record) return;
    const reason = manualReason.trim();
    if (!reason) {
      Taro.showToast({ title: '请填写人工销假理由', icon: 'none' });
      return;
    }
    setBusy(true);
    try {
      // P0 暂不带附件;学生需要附件可以让辅导员线下沟通,后续接 MinIO 上传时再补
      await applyManualReturn(record.id, reason, []);
      Taro.showToast({ title: '已提交,等辅导员审', icon: 'success' });
      setManualOpen(false);
      await load();
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '提交失败', icon: 'none' });
    } finally {
      setBusy(false);
    }
  };

  const openLocation = (lat: number, lng: number) => {
    Taro.openLocation({ latitude: lat, longitude: lng, scale: 16 }).catch(() => {
      Taro.showToast({ title: '无法打开地图', icon: 'none' });
    });
  };

  // ── 审批人动作 ───────────────────────────────────────
  const onApprove = () => {
    if (!taskId) return;
    Taro.showModal({
      title: '批准请假',
      content: '默认批注「同意」，确认后将通过下一节点。',
      confirmText: '确认批准',
      cancelText: '取消',
      success: async (r) => {
        if (!r.confirm) return;
        setBusy(true);
        try {
          await approveTask(taskId, '同意');
          Taro.showToast({ title: '已批准', icon: 'success' });
          setTimeout(() => Taro.navigateBack(), 600);
        } catch (e) {
          Taro.showToast({ title: e instanceof Error ? e.message : '批准失败', icon: 'none' });
          setBusy(false);
        }
      },
    });
  };

  const openRejectSheet = () => {
    setRejectComment('');
    setPolishOriginal(null);
    setRejectOpen(true);
  };

  const closeRejectSheet = () => {
    if (busy || polishing) return;
    setRejectOpen(false);
  };

  const onPolish = async () => {
    const draft = rejectComment.trim();
    if (!draft) {
      Taro.showToast({ title: '请先写一句草稿', icon: 'none' });
      return;
    }
    setPolishing(true);
    try {
      const ctx = record
        ? [
            `学生：${record.student_name ?? ''}`,
            `请假类型：${record.leave_type_name ?? '请假'}`,
            `时长：${record.duration_days}天`,
            record.reason ? `学生写的请假理由：${record.reason}` : '',
          ].filter(Boolean).join('\n')
        : undefined;
      const res = await polishRejection(draft, ctx);
      if (res.error_message) {
        Taro.showToast({ title: 'AI 改写不可用', icon: 'none' });
        return;
      }
      const polished = (res.polished ?? '').trim();
      if (!polished || polished === draft) {
        Taro.showToast({ title: 'AI 没有给出更好的改写', icon: 'none' });
        return;
      }
      setPolishOriginal(draft);
      setRejectComment(polished);
      Taro.showToast({ title: '已改写，可点撤销恢复', icon: 'none' });
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : 'AI 改写失败', icon: 'none' });
    } finally {
      setPolishing(false);
    }
  };

  const onRevertPolish = () => {
    if (polishOriginal == null) return;
    setRejectComment(polishOriginal);
    setPolishOriginal(null);
  };

  const onSubmitReject = async () => {
    if (!taskId) return;
    const trimmed = rejectComment.trim();
    if (!trimmed) {
      Taro.showToast({ title: '请填写驳回意见', icon: 'none' });
      return;
    }
    setBusy(true);
    try {
      await rejectTask(taskId, trimmed);
      Taro.showToast({ title: '已驳回', icon: 'success' });
      setRejectOpen(false);
      setTimeout(() => Taro.navigateBack(), 600);
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : '驳回失败', icon: 'none' });
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>加载中…</View>
      </View>
    );
  }

  if (!record) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>未找到该请假申请</View>
      </View>
    );
  }

  const tone = LEAVE_STATUS_TONES[record.status];
  const formData = record.form_data ?? {};
  const extraFields: LeaveExtraField[] = typeConfig?.extra_fields ?? [];
  const extraEntries = Object.entries(formData).filter(([k]) => k && k !== 'reject_reason');

  return (
    <View className={styles.page}>
      <ScrollView scrollY className={styles.scroll}>
        {/* ── Hero —— 状态 + 假别 + 创建时间 ─────────────── */}
        <View className={styles.hero}>
          <Text className={`${styles.statusPillLg} ${styles[`tone_${tone}`]}`}>
            {LEAVE_STATUS_LABELS[record.status]}
          </Text>
          <Text className={`${styles.heroTitle} display`}>
            {record.leave_type_name || '请假'}
          </Text>
          <Text className={styles.heroMeta}>
            创建于 <Text className="num">{formatDateTime(record.created_at)}</Text>
          </Text>
        </View>

        {/* ── 基本信息 ─────────────────────────────────── */}
        <View className={styles.card}>
          <View className={styles.row}>
            <Text className={styles.rowLabel}>开始时间</Text>
            <Text className={`${styles.rowValue} num`}>{formatDateTime(record.start_time)}</Text>
          </View>
          <View className={styles.divider} />
          <View className={styles.row}>
            <Text className={styles.rowLabel}>结束时间</Text>
            <Text className={`${styles.rowValue} num`}>{formatDateTime(record.end_time)}</Text>
          </View>
          <View className={styles.divider} />
          <View className={styles.row}>
            <Text className={styles.rowLabel}>请假天数</Text>
            <Text className={styles.rowValue}>
              <Text className="num">{record.duration_days}</Text>
              <Text className={styles.unit}> 天</Text>
            </Text>
          </View>
        </View>

        {/* ── 影响课程 trigger（仅审批人模式 + 当前学期有课表）── */}
        {isApprover && impact && impact.total_periods > 0 && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionLabel}>影响课程</Text>
            </View>
            <View className={`${styles.card} ${styles.impactCard}`}>
              <View
                className={styles.impactTrigger}
                onClick={() => setImpactExpanded((v) => !v)}
              >
                <View className={styles.impactStat}>
                  <Text className={`${styles.impactNum} num`}>{impact.total_periods}</Text>
                  <Text className={styles.impactNumUnit}> 节课</Text>
                </View>
                <Text className={styles.impactSep}>·</Text>
                <View className={styles.impactStat}>
                  <Text className={`${styles.impactNum} num`}>{impact.total_courses}</Text>
                  <Text className={styles.impactNumUnit}> 门</Text>
                </View>
                <Text className={styles.impactSep}>·</Text>
                <View className={styles.impactStat}>
                  <Text className={`${styles.impactNum} num`}>{impact.total_days}</Text>
                  <Text className={styles.impactNumUnit}> 天</Text>
                </View>
                <View className={styles.impactArrow}>
                  <Text className={styles.impactArrowGlyph}>{impactExpanded ? '收起' : '展开'}</Text>
                  <Text className={styles.impactArrowChev}>{impactExpanded ? '∧' : '∨'}</Text>
                </View>
              </View>

              {impactExpanded && (
                <View className={styles.impactList}>
                  {impact.by_day.map((d) => (
                    <View key={d.date} className={styles.impactDay}>
                      <View className={styles.impactDayHead}>
                        <Text className={`${styles.impactDayDate} num`}>{d.date}</Text>
                        <Text className={styles.impactDayMeta}>
                          周{['日','一','二','三','四','五','六'][d.day_of_week % 7]} · 第 {d.week} 周
                        </Text>
                      </View>
                      {d.courses.map((c, ci) => (
                        <View key={ci} className={styles.impactCourse}>
                          <View
                            className={styles.impactCourseDot}
                            style={c.color ? `background:${c.color}` : ''}
                          />
                          <View className={styles.impactCourseText}>
                            <Text className={styles.impactCourseName}>{c.course_name}</Text>
                            <Text className={styles.impactCourseMeta}>
                              {[c.teacher, c.location].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Text className={`${styles.impactCoursePeriod} num`}>
                            {c.start_period}-{c.end_period} 节
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* ── 请假原因 ─────────────────────────────────── */}
        {record.reason && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionLabel}>请假原因</Text>
            </View>
            <View className={styles.card}>
              <Text className={styles.bodyText}>{record.reason}</Text>
            </View>
          </>
        )}

        {/* ── 附加信息 (form_data) ─────────────────────── */}
        {extraEntries.length > 0 && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionLabel}>附加信息</Text>
            </View>
            <View className={styles.card}>
              {extraEntries.map(([k, v], i) => {
                const def = extraFields.find((f) => f.field_key === k);
                const label = def?.field_label ?? k;
                return (
                  <View key={k}>
                    {i > 0 && <View className={styles.divider} />}
                    <View className={styles.row}>
                      <Text className={styles.rowLabel}>{label}</Text>
                      <Text className={styles.rowValue}>{formatExtraValue(v)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── 驳回原因 (form_data.reject_reason 或 状态===rejected) ── */}
        {record.status === 'rejected' && typeof formData.reject_reason === 'string' && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionLabel}>驳回原因</Text>
            </View>
            <View className={`${styles.card} ${styles.cardDanger}`}>
              <Text className={styles.bodyText}>{String(formData.reject_reason)}</Text>
            </View>
          </>
        )}

        {/* ── 定位信息 ─────────────────────────────────── */}
        {(record.apply_latitude != null || record.return_latitude != null) && (
          <>
            <View className={styles.sectionHead}>
              <Text className={styles.sectionLabel}>提交定位</Text>
            </View>
            <View className={styles.card}>
              {record.apply_latitude != null && record.apply_longitude != null && (
                <View
                  className={styles.locRow}
                  onClick={() => openLocation(Number(record.apply_latitude), Number(record.apply_longitude))}
                >
                  <View className={styles.locText}>
                    <Text className={styles.rowLabel}>申请定位</Text>
                    <Text className={`${styles.locCoords} num`}>
                      {Number(record.apply_latitude).toFixed(4)}, {Number(record.apply_longitude).toFixed(4)}
                    </Text>
                  </View>
                  <Text className={styles.locArrow}>›</Text>
                </View>
              )}
              {record.return_latitude != null && record.return_longitude != null && (
                <>
                  {record.apply_latitude != null && <View className={styles.divider} />}
                  <View
                    className={styles.locRow}
                    onClick={() => openLocation(Number(record.return_latitude), Number(record.return_longitude))}
                  >
                    <View className={styles.locText}>
                      <Text className={styles.rowLabel}>销假定位</Text>
                      <Text className={`${styles.locCoords} num`}>
                        {Number(record.return_latitude).toFixed(4)}, {Number(record.return_longitude).toFixed(4)}
                      </Text>
                    </View>
                    <Text className={styles.locArrow}>›</Text>
                  </View>
                </>
              )}
            </View>
          </>
        )}

        <View className={styles.bottomSpace} />
      </ScrollView>

      {/* ── Action bar (sticky bottom) ──────────────────
          审批人模式 (taskId 存在): 批准 / 驳回
          学生模式: 撤回 / 申请销假 */}
      {isApprover && record.status === 'pending' && (
        <View className={styles.actionBar}>
          <View
            className={`${styles.barBtn} ${styles.barBtnGhost} tap-min`}
            onClick={busy ? undefined : openRejectSheet}
          >
            <Text className={styles.barBtnLabel}>驳回</Text>
          </View>
          <View
            className={`${styles.barBtn} ${styles.barBtnPrimary} tap-min`}
            onClick={busy ? undefined : onApprove}
          >
            <Text className={styles.barBtnLabel}>{busy ? '处理中…' : '批准'}</Text>
          </View>
        </View>
      )}
      {!isApprover && (record.status === 'pending' || record.status === 'approved') && (
        <View className={styles.actionBar}>
          {record.status === 'pending' && (
            <View
              className={`${styles.barBtn} ${styles.barBtnGhost} tap-min`}
              onClick={busy ? undefined : onWithdraw}
            >
              <Text className={styles.barBtnLabel}>{busy ? '处理中…' : '撤回申请'}</Text>
            </View>
          )}
          {record.status === 'approved' && (
            <View
              className={`${styles.barBtn} ${styles.barBtnPrimary} tap-min`}
              onClick={busy ? undefined : onCancel}
            >
              <Text className={styles.barBtnLabel}>{busy ? '处理中…' : '申请销假'}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── 人工销假申请底栏(GPS 不命中时的兜底通道)──── */}
      {manualOpen && (
        <View className={styles.rejectMask} onClick={() => !busy && setManualOpen(false)}>
          <View
            className={styles.rejectSheet}
            onClick={(e) => e.stopPropagation()}
            catchMove
          >
            <View className={styles.rejectHandle} />
            <View className={styles.rejectHeader}>
              <Text className={styles.rejectTitle}>申请人工销假</Text>
              <Text className={styles.rejectSubtitle}>说明你目前的情况,辅导员看后决定是否销假</Text>
            </View>

            <View className={styles.returnFields}>
              <Textarea
                className={styles.returnInput}
                value={manualReason}
                onInput={(e) => setManualReason(e.detail.value)}
                placeholder="例:在医院复诊未能赶回 / 高铁晚点滞留 / 校外宿舍已封闭"
                maxlength={1000}
                autoHeight
              />
            </View>

            <View className={styles.rejectActions}>
              <View
                className={`${styles.rejectAction} ${styles.rejectActionGhost} tap-min`}
                onClick={() => !busy && setManualOpen(false)}
              >
                <Text className={styles.rejectActionLabel}>取消</Text>
              </View>
              <View
                className={`${styles.rejectAction} ${styles.returnActionPrimary} tap-min`}
                onClick={busy ? undefined : submitManualApply}
              >
                <Text className={styles.rejectActionLabelDanger}>
                  {busy ? '提交中…' : '提交申请'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── 驳回底栏（带 AI 改写）─────────────────────── */}
      {rejectOpen && (
        <View className={styles.rejectMask} onClick={closeRejectSheet}>
          <View
            className={styles.rejectSheet}
            onClick={(e) => e.stopPropagation()}
            catchMove
          >
            <View className={styles.rejectHandle} />
            <View className={styles.rejectHeader}>
              <Text className={styles.rejectTitle}>驳回 {record.student_name ?? ''} 的请假</Text>
              <Text className={styles.rejectSubtitle}>意见学生可见，先写一句草稿可点 AI 改写</Text>
            </View>

            <View className={styles.rejectInputWrap}>
              <Textarea
                className={styles.rejectInput}
                value={rejectComment}
                onInput={(e) => {
                  setRejectComment(e.detail.value);
                  if (polishOriginal != null) setPolishOriginal(null);
                }}
                placeholder='例如"时间不对"，AI 会改成包含原因和建议的完整版本'
                maxlength={1000}
                autoHeight
                disableDefaultPadding
              />
            </View>

            <View className={styles.rejectActions}>
              {polishOriginal != null ? (
                <View
                  className={`${styles.rejectAction} ${styles.rejectActionGhost} tap-min`}
                  onClick={onRevertPolish}
                >
                  <Text className={styles.rejectActionLabel}>撤销改写</Text>
                </View>
              ) : (
                <View
                  className={`${styles.rejectAction} ${styles.rejectActionGhost} tap-min`}
                  onClick={polishing ? undefined : onPolish}
                >
                  <Text className={styles.rejectActionLabel}>
                    {polishing ? 'AI 改写中…' : 'AI 改写'}
                  </Text>
                </View>
              )}
              <View
                className={`${styles.rejectAction} ${styles.rejectActionDanger} tap-min`}
                onClick={busy ? undefined : onSubmitReject}
              >
                <Text className={styles.rejectActionLabelDanger}>
                  {busy ? '提交中…' : '确认驳回'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

