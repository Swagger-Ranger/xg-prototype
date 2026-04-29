import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/workStudy', () => ({
  listPositions: vi.fn(),
  listApplications: vi.fn(),
  listSalaries: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@/stores/ai-action.store', () => ({
  useAIActionStore: (selector: (s: { seedInput: () => void }) => unknown) =>
    selector({ seedInput: vi.fn() }),
}));
// echarts-for-react renders a canvas; stub it so we don't need real charts.
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: unknown }) => (
    <div data-testid="echarts" data-option={JSON.stringify(option)} />
  ),
}));

import DashboardTab from '../DashboardTab';
import { listApplications, listPositions, listSalaries } from '@/api/workStudy';
import { useAuth } from '@/hooks/useAuth';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('DashboardTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('staff view: shows 4 KPI cards driven by total counts', async () => {
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isStudent: false,
      user: { id: 1 },
    });
    const lp = listPositions as unknown as ReturnType<typeof vi.fn>;
    const la = listApplications as unknown as ReturnType<typeof vi.fn>;
    const ls = listSalaries as unknown as ReturnType<typeof vi.fn>;

    // Each call uses size=1 except chart-data calls (size=100). Match by status param.
    lp.mockImplementation((q: { status?: string; size?: number }) => {
      if (q.size === 100) return Promise.resolve({ data: [], total: 0 });
      if (q.status === 'open') return Promise.resolve({ data: [], total: 12 });
      if (q.status === 'closed') return Promise.resolve({ data: [], total: 5 });
      return Promise.resolve({ data: [], total: 0 });
    });
    la.mockImplementation((q: { status?: string; size?: number }) => {
      if (q.size === 100) return Promise.resolve({ data: [], total: 0 });
      if (q.status === 'pending') return Promise.resolve({ data: [], total: 3 });
      return Promise.resolve({ data: [], total: 0 });
    });
    ls.mockImplementation((q: { status?: string; size?: number }) => {
      if (q.size === 100) return Promise.resolve({ data: [], total: 0 });
      if (q.status === 'pending') return Promise.resolve({ data: [], total: 7 });
      return Promise.resolve({ data: [], total: 0 });
    });

    renderWithQuery(<DashboardTab />);

    // KPI titles render synchronously
    expect(screen.getByText('在招岗位')).toBeInTheDocument();
    expect(screen.getByText('已关闭岗位')).toBeInTheDocument();
    expect(screen.getByText('待审批申请')).toBeInTheDocument();
    expect(screen.getByText('待审批薪资')).toBeInTheDocument();

    // Numbers come from async react-query — wait for them
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('student view: shows my-application breakdown KPIs', async () => {
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isStudent: true,
      user: { id: 100 },
    });
    const lp = listPositions as unknown as ReturnType<typeof vi.fn>;
    const la = listApplications as unknown as ReturnType<typeof vi.fn>;

    lp.mockResolvedValue({ data: [], total: 9 });
    la.mockResolvedValue({
      total: 4,
      data: [
        { id: '1', status: 'pending' },
        { id: '2', status: 'pending' },
        { id: '3', status: 'hired' },
        { id: '4', status: 'rejected' },
      ],
    });

    renderWithQuery(<DashboardTab />);

    expect(screen.getByText('可申请岗位')).toBeInTheDocument();
    expect(screen.getByText('审批中')).toBeInTheDocument();
    expect(screen.getByText('已录用')).toBeInTheDocument();
    expect(screen.getByText('未通过')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument());
    // counts: pending=2, hired=1, rejected=1
    expect(screen.getByText('2')).toBeInTheDocument();
    // hired and rejected both show "1" — assert at least 2 elements with text "1"
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2);
  });
});
