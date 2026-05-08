import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/workStudy', () => ({
  listEmployers: vi.fn(),
}));

import EmployerSelect from '../EmployerSelect';
import { listEmployers } from '@/api/workStudy';

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('EmployerSelect', () => {
  const le = listEmployers as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    le.mockReset();
  });

  it('initial render fetches active employers (no keyword)', async () => {
    le.mockResolvedValue({
      data: [
        { id: '1', name: '图书馆', status: 'active' },
        { id: '2', name: '化学院', status: 'active' },
      ],
      total: 2,
    });

    withQuery(<EmployerSelect />);

    await waitFor(() => expect(le).toHaveBeenCalled());
    const call = le.mock.calls[0][0];
    expect(call).toMatchObject({ page: 1, status: 'active' });
    expect(call.keyword).toBeUndefined();
  });

  it('renders matching options when user opens the select', async () => {
    le.mockResolvedValue({
      data: [
        { id: '1', name: '图书馆', status: 'active' },
        { id: '2', name: '化学院', status: 'active' },
      ],
      total: 2,
    });
    const user = userEvent.setup();
    withQuery(<EmployerSelect />);
    await waitFor(() => expect(le).toHaveBeenCalled());

    // Antd Select renders a combobox; open it
    const combobox = screen.getByRole('combobox');
    await user.click(combobox);

    // Options carry "name（#id）" labels (rendered into popup portal)
    await waitFor(() => {
      expect(screen.getByText(/图书馆.*#1/)).toBeInTheDocument();
      expect(screen.getByText(/化学院.*#2/)).toBeInTheDocument();
    });
  });

  it('debounces keyword input — does NOT refire query within 300ms', async () => {
    le.mockResolvedValue({ data: [], total: 0 });
    const user = userEvent.setup();
    withQuery(<EmployerSelect />);

    await waitFor(() => expect(le).toHaveBeenCalledTimes(1));   // initial empty-keyword call

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await user.type(combobox, '图');

    // Within 300ms the 2nd call should NOT have fired yet — assert only 1 call
    expect(le).toHaveBeenCalledTimes(1);

    // After debounce window the debounced effect fires
    await waitFor(
      () => expect(le.mock.calls.some((c) => c[0]?.keyword === '图')).toBe(true),
      { timeout: 1000 },
    );
  });

  it('calls onChange with selected employer id', async () => {
    le.mockResolvedValue({
      data: [{ id: '7', name: '后勤处', status: 'active' }],
      total: 1,
    });
    const onChange = vi.fn();
    const user = userEvent.setup();
    withQuery(<EmployerSelect onChange={onChange} />);
    await waitFor(() => expect(le).toHaveBeenCalled());

    const combobox = screen.getByRole('combobox');
    await user.click(combobox);
    await waitFor(() => screen.getByText(/后勤处.*#7/));
    await user.click(screen.getByText(/后勤处.*#7/));

    expect(onChange).toHaveBeenCalledWith('7');
  });
});
