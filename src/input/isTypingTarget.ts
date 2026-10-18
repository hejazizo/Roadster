// True when a key event comes from a text field (e.g. the tuning panel), so game
// shortcuts don't steal keys the user is typing. A focused slider (the menus' volume) isn't
// one: the game keeps its keys.
export function isTypingTarget(e: KeyboardEvent) {
  const el = e.target
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable ||
      (el instanceof HTMLInputElement && el.type !== 'range') ||
      el.tagName === 'TEXTAREA')
  )
}
