<script setup lang="ts">
import Tag from 'primevue/tag';
import type { StatusTag } from '../../utils/statusTags';

defineProps<{ tag: StatusTag }>();
</script>

<template>
  <Tag :value="tag.label" :severity="tag.severity" />
</template>
