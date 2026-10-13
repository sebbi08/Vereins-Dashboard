<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import {
  MAX_EMAIL_BODY_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
  type EmailTextValues,
  type InvoiceEmailText,
} from 'shared';
import { computed, ref, watchEffect } from 'vue';
import { useNotify } from '../composables/useNotify';
import { requestJson } from '../utils/requestJson';

const props = defineProps<{
  /** What "Reset from template" fills the placeholders with. */
  source: EmailTextValues;
  disabled?: boolean;
}>();
const subject = defineModel<string>('subject', { required: true });
const body = defineModel<string>('body', { required: true });
/** True while the text cannot be saved (blank subject). */
const invalid = defineModel<boolean>('invalid', { default: false });

const RESET_FAILED = 'Email text could not be loaded from the template';

const notify = useNotify();
const resetting = ref(false);
const subjectMissing = computed(() => subject.value.trim() === '');
watchEffect(() => {
  invalid.value = subjectMissing.value;
});

/** Builds the text anew from the template; the surrounding form or card saves it. */
async function resetFromTemplate() {
  resetting.value = true;
  try {
    const { emailSalutation, name, title, email } = props.source;
    const res = await requestJson('/api/email-settings/invoice-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailSalutation, name, title, email }),
    });
    if (!res.ok) {
      notify.error(RESET_FAILED);
      return;
    }
    const text = res.body as unknown as InvoiceEmailText;
    subject.value = text.emailSubject;
    body.value = text.emailBody;
  } catch {
    notify.error(RESET_FAILED);
  } finally {
    resetting.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <div class="field">
      <label for="invoice-email-subject">Email Subject</label>
      <InputText
        id="invoice-email-subject"
        v-model="subject"
        :disabled="disabled"
        :invalid="subjectMissing"
        :maxlength="MAX_EMAIL_SUBJECT_LENGTH"
        fluid
        data-testid="email-subject"
      />
      <Message
        v-if="subjectMissing"
        severity="error"
        size="small"
        variant="simple"
        data-testid="error-email-subject"
      >
        Email subject is required
      </Message>
    </div>
    <div class="field">
      <label for="invoice-email-body">Email Text</label>
      <Textarea
        id="invoice-email-body"
        v-model="body"
        :disabled="disabled"
        :maxlength="MAX_EMAIL_BODY_LENGTH"
        rows="8"
        fluid
        data-testid="email-body"
      />
      <small class="muted">
        {number} is replaced by the invoice number when the email is sent.
      </small>
    </div>
    <div v-if="!disabled" class="row">
      <Button
        label="Reset from template"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="resetting"
        data-testid="reset-email-text"
        @click="resetFromTemplate"
      />
    </div>
  </div>
</template>
