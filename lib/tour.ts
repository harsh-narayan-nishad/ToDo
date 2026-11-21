/**
 * Tasks the guided tour created and is about to show being ticked off. Ticking one of these deletes it for good
 * (it never goes to Done), so the tour leaves no practice task behind. Cleared when the tour ends.
 */
export const tourTasks = new Set<string>();
