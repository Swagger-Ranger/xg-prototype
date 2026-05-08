import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { timeSlotsFromApi, timeSlotsToApi } from '../TimeSlotsEditor';

describe('TimeSlotsEditor — pure helpers', () => {
  describe('timeSlotsToApi', () => {
    it('returns undefined for empty/null inputs', () => {
      expect(timeSlotsToApi(undefined)).toBeUndefined();
      expect(timeSlotsToApi([])).toBeUndefined();
    });

    it('drops rows with missing day/start/end', () => {
      const out = timeSlotsToApi([
        { day: 'mon', start: dayjs('14:00', 'HH:mm'), end: dayjs('17:00', 'HH:mm') },
        { day: undefined, start: dayjs('09:00', 'HH:mm'), end: dayjs('10:00', 'HH:mm') },
        { day: 'wed', start: undefined, end: dayjs('11:00', 'HH:mm') },
        { day: 'thu', start: dayjs('14:00', 'HH:mm'), end: undefined },
      ]);
      expect(out).toEqual([{ day: 'mon', start: '14:00', end: '17:00' }]);
    });

    it('formats times as HH:mm', () => {
      const out = timeSlotsToApi([
        { day: 'fri', start: dayjs('09:05', 'HH:mm'), end: dayjs('17:30', 'HH:mm') },
      ]);
      expect(out).toEqual([{ day: 'fri', start: '09:05', end: '17:30' }]);
    });

    it('returns undefined when every row is incomplete', () => {
      expect(timeSlotsToApi([{ day: 'mon' }])).toBeUndefined();
    });
  });

  describe('timeSlotsFromApi', () => {
    it('returns [] for null/empty', () => {
      expect(timeSlotsFromApi(null)).toEqual([]);
      expect(timeSlotsFromApi(undefined)).toEqual([]);
      expect(timeSlotsFromApi([])).toEqual([]);
    });

    it('parses JSON string from backend', () => {
      const out = timeSlotsFromApi('[{"day":"mon","start":"14:00","end":"17:00"}]');
      expect(out).toHaveLength(1);
      expect(out[0].day).toBe('mon');
      expect(out[0].start?.format('HH:mm')).toBe('14:00');
      expect(out[0].end?.format('HH:mm')).toBe('17:00');
    });

    it('returns [] on malformed JSON', () => {
      expect(timeSlotsFromApi('not-json')).toEqual([]);
    });

    it('drops entries missing required fields', () => {
      const out = timeSlotsFromApi([
        { day: 'mon', start: '14:00', end: '17:00' },
        { day: 'tue', start: '14:00' } as never,
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].day).toBe('mon');
    });

    it('round-trips toApi(fromApi(x))', () => {
      const raw = [
        { day: 'mon' as const, start: '14:00', end: '17:00' },
        { day: 'wed' as const, start: '09:00', end: '12:00' },
      ];
      const back = timeSlotsToApi(timeSlotsFromApi(raw));
      expect(back).toEqual(raw);
    });
  });
});
