import { onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useConfirmAction } from './useConfirmAction';

/**
 * Warns before unsaved form changes are lost: navigating inside the app asks for confirmation,
 * closing or reloading the tab triggers the browser's own prompt. Call `allowLeave()` right
 * before navigating away after a successful save.
 */
export function useUnsavedChangesGuard(isDirty: () => boolean) {
  const { confirmAction } = useConfirmAction();
  let leaveAllowed = false;

  onBeforeRouteLeave(async () => {
    if (leaveAllowed || !isDirty()) return true;
    return confirmAction({
      message: 'You have unsaved changes. Leave this page and discard them?',
      header: 'Unsaved changes',
      acceptLabel: 'Discard changes',
      rejectLabel: 'Keep editing',
      danger: true,
    });
  });

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (leaveAllowed || !isDirty()) return;
    event.preventDefault();
    // Older browsers only show the prompt when returnValue is set
    event.returnValue = '';
  }
  window.addEventListener('beforeunload', onBeforeUnload);
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

  return {
    allowLeave() {
      leaveAllowed = true;
    },
  };
}
