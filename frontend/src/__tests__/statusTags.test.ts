import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StatusTag from '../components/ui/StatusTag.vue';
import {
  DOCUMENT_STATUS_OPTIONS,
  documentStatusTag,
  EMAIL_STATUS_OPTIONS,
  emailStatusTag,
  pdfStatusTag,
  revisionStatusTag,
} from '../utils/statusTags';
import { withPrimeVue } from './helpers/primeVue';

describe('status tags', () => {
  it.each([
    [documentStatusTag, 'AKTIV', 'Active', 'success'],
    [documentStatusTag, 'STORNIERT', 'Cancelled', 'secondary'],
    [revisionStatusTag, 'AKTIV', 'Current', 'info'],
    [revisionStatusTag, 'ERSETZT', 'Superseded', 'secondary'],
    [pdfStatusTag, 'OK', 'PDF ready', 'success'],
    [pdfStatusTag, 'PENDING', 'PDF pending', 'secondary'],
    [pdfStatusTag, 'FAILED', 'PDF failed', 'danger'],
    [emailStatusTag, 'SENT', 'Email sent', 'success'],
    [emailStatusTag, 'FAILED', 'Email failed', 'danger'],
    [emailStatusTag, 'NOT_SENT', 'Not sent', 'secondary'],
  ])('%o maps %s', (fn, status, label, severity) => {
    expect(fn(status)).toEqual({ label, severity });
  });

  it('falls back to the raw value', () => {
    expect(documentStatusTag('WEIRD')).toEqual({ label: 'WEIRD', severity: 'secondary' });
  });

  it('offers filter options', () => {
    expect(DOCUMENT_STATUS_OPTIONS).toEqual([
      { label: 'Active', value: 'AKTIV' },
      { label: 'Cancelled', value: 'STORNIERT' },
    ]);
    expect(EMAIL_STATUS_OPTIONS.map((o) => o.value)).toEqual(['NOT_SENT', 'SENT', 'FAILED']);
  });

  it('renders a PrimeVue tag', () => {
    const wrapper = mount(StatusTag, {
      props: { tag: { label: 'Active', severity: 'success' } },
      global: withPrimeVue(),
    });
    expect(wrapper.text()).toBe('Active');
    expect(wrapper.classes().join(' ')).toContain('p-tag-success');
  });
});
