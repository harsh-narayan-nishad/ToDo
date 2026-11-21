/**
 * Tasks the guided tour created and is about to show being ticked off. Ticking one of these deletes it for good
 * (it never goes to Done), so the tour leaves no practice task behind. Cleared when the tour ends.
 */
export const tourTasks = new Set<string>();

/**
 * While the tour plays it is virtual: the task planner makes its practice task on the screen only (id "tour-…"),
 * never on the server, so the tour cannot be refused by a rule, the clock or the network.
 */
export const tourState = { virtual: false };
