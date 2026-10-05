import type { Directive } from 'vue';

function resize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/** Grows a textarea with its content (initial load and every update). */
export const vAutogrow: Directive<HTMLTextAreaElement> = {
  mounted: resize,
  updated: resize,
};
