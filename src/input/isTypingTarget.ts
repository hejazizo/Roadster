// True when a key event comes from a text field (e.g. the tuning panel), so game
// shortcuts don't steal keys the user is typing.
export function isTypingTarget(e: KeyboardEvent) {
  const el = e.target
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
  )
}
