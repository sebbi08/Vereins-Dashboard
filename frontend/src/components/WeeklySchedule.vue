<script setup lang="ts">
import Button from 'primevue/button';
import Fieldset from 'primevue/fieldset';
import Message from 'primevue/message';
import {
  blockNetMinutes,
  type TimeBlock,
  type TimeRange,
  type ValidationIssue,
  type Weekday,
  WEEKDAYS,
} from 'shared';
import { computed } from 'vue';
import { formatHours } from '../utils/format';

const props = defineProps<{
  modelValue: TimeBlock[];
  issues: ValidationIssue[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: TimeBlock[]];
}>();

const DAY_LABELS: Record<Weekday, string> = {
  MO: 'Mo',
  DI: 'Di',
  MI: 'Mi',
  DO: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SO: 'So',
};

/** PrimeVue look for the native time inputs (spec: values stay "HH:MM"). */
const TIME_INPUT_CLASS = 'p-inputtext p-component p-inputtext-sm';

/** Blocks grouped by weekday, keeping the index into the flat modelValue array. */
const days = computed(() =>
  WEEKDAYS.map((weekday) => ({
    weekday,
    label: DAY_LABELS[weekday],
    blocks: props.modelValue
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.weekday === weekday),
  })),
);

function issuesFor(index: number): string[] {
  const path = `timeBlocks.${index}`;
  const messages = props.issues
    .filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`))
    .map((issue) => issue.message);
  return [...new Set(messages)];
}

function cloneBlocks(): TimeBlock[] {
  return props.modelValue.map((b) => ({ ...b, breaks: b.breaks.map((br) => ({ ...br })) }));
}

function emitWith(change: (_blocks: TimeBlock[]) => void) {
  const blocks = cloneBlocks();
  change(blocks);
  emit('update:modelValue', blocks);
}

function addBlock(weekday: Weekday) {
  emitWith((blocks) => blocks.push({ weekday, start: '', end: '', breaks: [] }));
}

function removeBlock(index: number) {
  emitWith((blocks) => blocks.splice(index, 1));
}

function updateBlock(index: number, field: keyof TimeRange, value: string) {
  emitWith((blocks) => {
    blocks[index][field] = value;
  });
}

function addBreak(index: number) {
  emitWith((blocks) => blocks[index].breaks.push({ start: '', end: '' }));
}

function removeBreak(index: number, breakIndex: number) {
  emitWith((blocks) => blocks[index].breaks.splice(breakIndex, 1));
}

function updateBreak(index: number, breakIndex: number, field: keyof TimeRange, value: string) {
  emitWith((blocks) => {
    blocks[index].breaks[breakIndex][field] = value;
  });
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
</script>

<template>
  <div class="schedule">
    <Fieldset
      v-for="day in days"
      :key="day.weekday"
      :legend="day.label"
      :data-testid="`day-${day.weekday}`"
    >
      <div class="stack gap-sm">
        <div
          v-for="{ block, index } in day.blocks"
          :key="index"
          data-testid="block"
          class="schedule__block"
        >
          <div class="row gap-sm">
            <input
              data-testid="block-start"
              type="time"
              :value="block.start"
              aria-label="Start"
              :class="TIME_INPUT_CLASS"
              @input="updateBlock(index, 'start', inputValue($event))"
            />
            <span class="muted">–</span>
            <input
              data-testid="block-end"
              type="time"
              :value="block.end"
              aria-label="End"
              :class="TIME_INPUT_CLASS"
              @input="updateBlock(index, 'end', inputValue($event))"
            />
            <span v-if="issuesFor(index).length === 0" data-testid="block-hours" class="muted"
              >{{ formatHours(blockNetMinutes(block)) }} h</span
            >
            <span class="schedule__spacer"></span>
            <Button
              label="Pause"
              icon="pi pi-plus"
              size="small"
              text
              data-testid="add-break"
              @click="addBreak(index)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              aria-label="Remove block"
              data-testid="remove-block"
              @click="removeBlock(index)"
            />
          </div>

          <div
            v-for="(brk, breakIndex) in block.breaks"
            :key="breakIndex"
            class="row gap-sm schedule__break"
          >
            <span class="muted schedule__break-label">Pause</span>
            <input
              data-testid="break-start"
              type="time"
              :value="brk.start"
              aria-label="Break start"
              :class="TIME_INPUT_CLASS"
              @input="updateBreak(index, breakIndex, 'start', inputValue($event))"
            />
            <span class="muted">–</span>
            <input
              data-testid="break-end"
              type="time"
              :value="brk.end"
              aria-label="Break end"
              :class="TIME_INPUT_CLASS"
              @input="updateBreak(index, breakIndex, 'end', inputValue($event))"
            />
            <Button
              icon="pi pi-times"
              size="small"
              text
              severity="danger"
              aria-label="Remove break"
              data-testid="remove-break"
              @click="removeBreak(index, breakIndex)"
            />
          </div>

          <Message
            v-for="message in issuesFor(index)"
            :key="message"
            severity="error"
            size="small"
            variant="simple"
            data-testid="block-issue"
          >
            {{ message }}
          </Message>
        </div>

        <div>
          <Button
            label="Block"
            icon="pi pi-plus"
            size="small"
            text
            :data-testid="`add-block-${day.weekday}`"
            @click="addBlock(day.weekday)"
          />
        </div>
      </div>
    </Fieldset>
  </div>
</template>

<style scoped>
.schedule {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1rem;
}

.schedule__block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}

.schedule__spacer {
  flex: 1;
}

.schedule__break {
  padding-left: 1rem;
}

.schedule__break-label {
  font-size: 0.8125rem;
}
</style>
