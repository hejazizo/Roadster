import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { onPress } from '../input/input'

// Menu navigation by d-pad, stick or arrow keys, with a focus ring. The focus is virtual:
// nothing takes DOM focus, so Enter and Space keep going to the input layer (no button
// clicks itself again). Up / down move the focus, confirm activates the focused item, and
// left / right adjust it (a picker, a slider).
//
// Focus starts on the item confirm always triggered before menus had a focus (Play, Restart,
// Retry), and the ring only shows once up or down is pressed, so a player who never
// navigates sees and gets what they did before.

export type NavItem = {
  id: string
  activate?: () => void
  adjust?: (dir: 1 | -1) => void
}

type NavOptions = {
  // Left / right when the focused item has no adjust of its own (the main menu's paint).
  fallbackAdjust?: (dir: 1 | -1) => void
  // A sheet over a screen: it takes all menu input until it closes with back or pause.
  onClose?: () => void
}

// Mounted navs, innermost last: only the last one gets input.
const stack: symbol[] = []
let sheets = 0

// A sheet is open over the menu: screen hotkeys (level, mode, assists, quit) wait.
export const isSheetOpen = () => sheets > 0

export function useMenuNav(items: NavItem[], defaultId: string, options: NavOptions = {}) {
  const [focus, setFocus] = useState(defaultId)
  const [ring, setRing] = useState(false)
  const latest = useRef({ items, defaultId, options, focus })
  useLayoutEffect(() => {
    latest.current = { items, defaultId, options, focus }
  })
  const sheet = options.onClose !== undefined

  useEffect(() => {
    const token = Symbol('menu nav')
    stack.push(token)
    if (sheet) sheets++
    const off = onPress((action) => {
      if (stack[stack.length - 1] !== token) return
      const { items, defaultId, options, focus } = latest.current
      const at = (id: string) => items.findIndex((item) => item.id === id)
      const index = at(focus) >= 0 ? at(focus) : Math.max(at(defaultId), 0)
      const item = items[index]
      if (action === 'up' || action === 'down') {
        const step = action === 'down' ? 1 : -1
        setFocus(items[(index + step + items.length) % items.length].id)
        setRing(true)
      } else if (action === 'confirm') {
        item?.activate?.()
      } else if (action === 'prev' || action === 'next') {
        const dir = action === 'next' ? 1 : -1
        if (item?.adjust) item.adjust(dir)
        else options.fallbackAdjust?.(dir)
      } else if ((action === 'back' || action === 'pause') && options.onClose) {
        options.onClose()
      }
    })
    return () => {
      off()
      stack.splice(stack.indexOf(token), 1)
      if (sheet) sheets--
    }
  }, [sheet])

  // An item that went away (the mode card on a level without stunts) hands focus back.
  const focused = items.some((item) => item.id === focus) ? focus : defaultId
  return {
    // The ring for an item, once the player has navigated.
    isFocused: (id: string) => ring && focused === id,
    focusItem: setFocus,
  }
}
