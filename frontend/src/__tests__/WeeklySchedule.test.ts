import { mount } from '@vue/test-utils';
import type { TimeBlock, ValidationIssue } from 'shared';
import { describe, expect, it } from 'vitest';
import WeeklySchedule from '../components/WeeklySchedule.vue';

const monday: TimeBlock = { weekday: 'MO', start: '08:00', end: '12:00', breaks: [] };

function mountSchedule(modelValue: TimeBlock[], issues: ValidationIssue[] = []) {
  return mount(WeeklySchedule, { props: { modelValue, issues } });
}

function lastEmitted(wrapper: ReturnType<typeof mount>): TimeBlock[] {
  const events = wrapper.emitted('update:modelValue') as TimeBlock[][][];
  return events[events.length - 1][0];
}

describe('WeeklySchedule', () => {
  it('renders seven day sections Mo to So', () => {
    const wrapper = mountSchedule([]);
    for (const day of ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO']) {
      expect(wrapper.find(`[data-testid="day-${day}"]`).exists()).toBe(true);
    }
  });

  it('shows blocks under their weekday', () => {
    const wrapper = mountSchedule([monday, { ...monday, weekday: 'FR' }]);
    expect(wrapper.find('[data-testid="day-MO"]').findAll('[data-testid="block"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="day-FR"]').findAll('[data-testid="block"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="day-DI"]').findAll('[data-testid="block"]')).toHaveLength(0);
  });

  it('adds an empty block on the chosen day', async () => {
    const wrapper = mountSchedule([monday]);
    await wrapper.find('[data-testid="add-block-DI"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual([
      monday,
      { weekday: 'DI', start: '', end: '', breaks: [] },
    ]);
  });

  it('updates the start time of a block', async () => {
    const wrapper = mountSchedule([monday]);
    await wrapper.find('[data-testid="block-start"]').setValue('09:00');
    expect(lastEmitted(wrapper)).toEqual([{ ...monday, start: '09:00' }]);
  });

  it('adds, edits and removes breaks', async () => {
    const wrapper = mountSchedule([monday]);
    await wrapper.find('[data-testid="add-break"]').trigger('click');
    expect(lastEmitted(wrapper)[0].breaks).toEqual([{ start: '', end: '' }]);

    await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
    await wrapper.find('[data-testid="break-end"]').setValue('10:30');
    expect(lastEmitted(wrapper)[0].breaks).toEqual([{ start: '', end: '10:30' }]);

    await wrapper.setProps({ modelValue: lastEmitted(wrapper) });
    await wrapper.find('[data-testid="remove-break"]').trigger('click');
    expect(lastEmitted(wrapper)[0].breaks).toEqual([]);
  });

  it('removes a block', async () => {
    const wrapper = mountSchedule([monday, { ...monday, weekday: 'FR' }]);
    await wrapper.find('[data-testid="day-MO"] [data-testid="remove-block"]').trigger('click');
    expect(lastEmitted(wrapper)).toEqual([{ ...monday, weekday: 'FR' }]);
  });

  it('shows net hours for a valid block', () => {
    const wrapper = mountSchedule([{ ...monday, breaks: [{ start: '10:00', end: '10:30' }] }]);
    expect(wrapper.find('[data-testid="block-hours"]').text()).toBe('3,5 h');
  });

  it('shows issues of a block and hides its hours', () => {
    const wrapper = mountSchedule(
      [monday, { ...monday, start: '11:00', end: '13:00' }],
      [{ path: 'timeBlocks.1', message: 'Time blocks on the same day must not overlap' }],
    );
    const blocks = wrapper.findAll('[data-testid="block"]');
    expect(blocks[0].find('[data-testid="block-issue"]').exists()).toBe(false);
    expect(blocks[1].find('[data-testid="block-issue"]').text()).toBe(
      'Time blocks on the same day must not overlap',
    );
    expect(blocks[1].find('[data-testid="block-hours"]').exists()).toBe(false);
  });

  it('does not mutate the prop array', async () => {
    const blocks = [monday];
    const wrapper = mountSchedule(blocks);
    await wrapper.find('[data-testid="block-start"]').setValue('09:00');
    expect(blocks[0].start).toBe('08:00');
  });
});
