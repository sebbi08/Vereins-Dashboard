import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { TemplateDto } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TemplateCard from '../components/TemplateCard.vue';
import { withPrimeVue } from './helpers/primeVue';

const { notify } = vi.hoisted(() => ({
  notify: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../composables/useNotify', () => ({ useNotify: () => notify }));

const stored: TemplateDto = {
  id: 1,
  type: 'RECHNUNG',
  version: 3,
  fileName: 'rechnung.docx',
  active: true,
  uploadedAt: '2026-10-01T10:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

function mountCard(template: TemplateDto | null = stored): VueWrapper {
  return mount(TemplateCard, {
    props: {
      type: 'RECHNUNG',
      label: 'Invoice (.docx)',
      accept: '.docx',
      previewTitle: 'Invoice Preview',
      template,
    },
    attachTo: document.body,
    global: withPrimeVue({ stubs: { transition: false } }),
  });
}

async function chooseFile(wrapper: VueWrapper, name = 'neu.docx') {
  const input = wrapper.find('input[type="file"]');
  const file = new File(['docx'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
  return file;
}

function dialogTitle(): string | null {
  return document.querySelector('h3.dialog-title')?.textContent ?? null;
}

beforeEach(() => {
  Object.values(notify).forEach((fn) => fn.mockReset());
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TemplateCard', () => {
  it('shows label, version, upload date and download link', () => {
    const wrapper = mountCard();
    expect(wrapper.find('p.template-card__label').text()).toBe('Invoice (.docx)');
    expect(wrapper.find('[data-testid="template-version"]').text()).toBe(
      'Version 3 · uploaded on 01.10.2026',
    );
    expect(wrapper.find('[data-testid="template-download"]').attributes('href')).toBe(
      '/api/templates/RECHNUNG/download',
    );
    expect(wrapper.find('input[type="file"]').attributes('accept')).toBe('.docx');
  });

  it('shows the missing state and disables the current preview', () => {
    const wrapper = mountCard(null);
    expect(wrapper.find('[data-testid="template-missing"]').text()).toBe('No template uploaded');
    expect(wrapper.find('[data-testid="template-download"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="show-preview"]').attributes('disabled')).toBeDefined();
  });

  it('previews a chosen file and saves it', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'UERG' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    const wrapper = mountCard();

    await chooseFile(wrapper);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/templates/RECHNUNG/preview');
    expect(dialogTitle()).toBe('Invoice Preview');
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
      'data:application/pdf;base64,UERG',
    );

    (document.querySelector('[data-testid="save-template"]') as HTMLElement).click();
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toBe('/api/templates/RECHNUNG/upload');
    expect(notify.success).toHaveBeenCalledWith('Template uploaded successfully');
    expect(wrapper.emitted('uploaded')).toHaveLength(1);
    await vi.waitFor(() => expect(dialogTitle()).toBeNull());
  });

  it('explains missing template fields', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ missingRequiredFields: ['Name', 'ReNr'] }),
    });
    const wrapper = mountCard();
    await chooseFile(wrapper);
    expect(notify.error).toHaveBeenCalledWith('Missing required fields: Name, ReNr');
    expect(dialogTitle()).toBeNull();
  });

  it('reports an upload error and keeps the dialog open', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: 'UERG' }) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Too large' }) });
    const wrapper = mountCard();
    await chooseFile(wrapper);
    (document.querySelector('[data-testid="save-template"]') as HTMLElement).click();
    await flushPromises();
    expect(notify.error).toHaveBeenCalledWith('Too large');
    expect(wrapper.emitted('uploaded')).toBeUndefined();
    expect(dialogTitle()).toBe('Invoice Preview');
  });

  it('shows the current preview without a save button', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['pdf'])) });
    const wrapper = mountCard();

    await wrapper.find('[data-testid="show-preview"]').trigger('click');
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/templates/preview/RECHNUNG');
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe('blob:preview');
    expect(document.querySelector('[data-testid="save-template"]')).toBeNull();
  });

  it('shows the current preview error inside the dialog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Preview failed' }),
    });
    const wrapper = mountCard();
    await wrapper.find('[data-testid="show-preview"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Preview failed');
    expect(document.querySelector('iframe')).toBeNull();
  });
});
