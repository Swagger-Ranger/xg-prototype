-- Per-leave bitmask tracking which time-based reminders have already fired.
-- Bits: 1=start (start_time-2h), 2=pre_end (end_time-2h),
--       4=due (end_time..end_time+2h), 8=overdue (end_time+2h+, escalates to counselor).
-- LeaveReminderScheduler ORs the bit in after each successful send so reminders
-- never repeat.
ALTER TABLE leave_request ADD COLUMN reminder_sent_mask SMALLINT NOT NULL DEFAULT 0;

-- Backfill: any leave whose start_time has already passed at migration time
-- gets all four bits set so we don't flood mailboxes with retroactive reminders
-- for in-progress or past leaves. Future-starting leaves keep mask=0 and will
-- receive reminders normally.
UPDATE leave_request SET reminder_sent_mask = 15 WHERE start_time < NOW();
