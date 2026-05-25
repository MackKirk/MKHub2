import type { ReactNode } from 'react';

/**
 * Standard Quick Info structure for `AppFormModal` (`quickInfo` prop).
 *
 * Write for end users — explain what the window does and how to use it.
 * Do not mention component names, props, or implementation details.
 *
 * **Paragraph order**
 * 1. **Purpose** — What this window is for, with one or two concrete examples.
 * 2. **How to use** — Main steps; name visible UI labels (buttons, sections, fields).
 * 3. **Behavior** *(optional)* — Multiple items, combined rules, or “what happens when…”.
 * 4. **Actions** — What Cancel, the primary button, and any secondary buttons do.
 *
 * Use `uiLabel()` for button names and key labels so they stand out in the panel.
 */
export type FormModalQuickInfoCopy = {
  purpose: ReactNode;
  howToUse: ReactNode;
  behavior?: ReactNode;
  actions: ReactNode;
};

/** Emphasize a visible UI label inside Quick Info copy. */
export function uiLabel(children: ReactNode) {
  return <span className="font-medium text-gray-800">{children}</span>;
}

export function formModalQuickInfo(copy: FormModalQuickInfoCopy): ReactNode {
  return (
    <>
      <p>{copy.purpose}</p>
      <p>{copy.howToUse}</p>
      {copy.behavior ? <p>{copy.behavior}</p> : null}
      <p>{copy.actions}</p>
    </>
  );
}

/** Reference copy — Filters modal (Projects, Opportunities, etc.). */
export const filtersModalQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Use this window to narrow the list — for example, only projects in progress, or opportunities for a
      specific customer.
    </>
  ),
  howToUse: (
    <>
      Tap {uiLabel('Add filter')} to start. For each filter, choose what to look at (such as Status or Division), how
      to compare it (is, is not, before a date, and so on), then pick the value.
    </>
  ),
  behavior: (
    <>
      You can add more than one filter. The list shows items that match {uiLabel('all')} of your filters at the same
      time.
    </>
  ),
  actions: (
    <>
      {uiLabel('Apply Filters')} updates the list and closes this window. {uiLabel('Clear All')} removes every filter
      before you apply. {uiLabel('Cancel')} closes without changing what is already on the list.
    </>
  ),
});

/** Reference copy — Create Request (Task Requests). */
export const createRequestQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Start a conversation with someone on your team before it becomes a task — useful when you need more detail or
      approval first.
    </>
  ),
  howToUse: (
    <>
      Add a {uiLabel('Title')}, choose {uiLabel('Priority')}, and pick who receives the request (a specific person or a
      whole division). Project and due date are optional but help set expectations.
    </>
  ),
  behavior: (
    <>
      The recipient can reply and ask questions. Once they accept, the request can move forward as regular work.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without sending. {uiLabel('Create Request')} sends the request and adds it to your sent
      list.
    </>
  ),
});
