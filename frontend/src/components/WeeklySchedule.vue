<script setup lang="ts">
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
  <div class="space-y-4">
    <div
      v-for="day in days"
      :key="day.weekday"
      :data-testid="`day-${day.weekday}`"
      class="border border-gray-200 rounded-lg p-4"
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-medium text-gray-800">{{ day.label }}</h4>
        <button
          type="button"
          :data-testid="`add-block-${day.weekday}`"
          class="text-sm text-blue-600 hover:underline"
          @click="addBlock(day.weekday)"
        >
          + Block
        </button>
      </div>

      <div
        v-for="{ block, index } in day.blocks"
        :key="index"
        data-testid="block"
        class="bg-gray-50 rounded-lg p-3 mb-2"
      >
        <div class="flex flex-wrap items-center gap-2">
          <input
            data-testid="block-start"
            type="time"
            :value="block.start"
            aria-label="Start"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBlock(index, 'start', inputValue($event))"
          />
          <span class="text-gray-500">–</span>
          <input
            data-testid="block-end"
            type="time"
            :value="block.end"
            aria-label="End"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBlock(index, 'end', inputValue($event))"
          />
          <span
            v-if="issuesFor(index).length === 0"
            data-testid="block-hours"
            class="text-sm text-gray-600"
            >{{ formatHours(blockNetMinutes(block)) }} h</span
          >
          <button
            type="button"
            data-testid="add-break"
            class="text-sm text-blue-600 hover:underline ml-auto"
            @click="addBreak(index)"
          >
            + Pause
          </button>
          <button
            type="button"
            data-testid="remove-block"
            class="text-sm text-red-600 hover:underline"
            @click="removeBlock(index)"
          >
            Remove
          </button>
        </div>

        <div
          v-for="(brk, breakIndex) in block.breaks"
          :key="breakIndex"
          class="flex items-center gap-2 mt-2 ml-6"
        >
          <span class="text-xs text-gray-500">Pause</span>
          <input
            data-testid="break-start"
            type="time"
            :value="brk.start"
            aria-label="Break start"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBreak(index, breakIndex, 'start', inputValue($event))"
          />
          <span class="text-gray-500">–</span>
          <input
            data-testid="break-end"
            type="time"
            :value="brk.end"
            aria-label="Break end"
            class="border border-gray-300 rounded-lg px-2 py-1 text-sm"
            @input="updateBreak(index, breakIndex, 'end', inputValue($event))"
          />
          <button
            type="button"
            data-testid="remove-break"
            class="text-xs text-red-600 hover:underline"
            @click="removeBreak(index, breakIndex)"
          >
            Remove
          </button>
        </div>

        <p
          v-for="message in issuesFor(index)"
          :key="message"
          data-testid="block-issue"
          class="text-xs text-red-600 mt-2"
        >
          {{ message }}
        </p>
      </div>
    </div>
  </div>
</template>
