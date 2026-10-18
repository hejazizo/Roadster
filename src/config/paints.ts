// Paint colours for the car, picked on the main menu. A car model's `paint` material is
// recoloured with these (docs/car-model-spec.md); the first is the default, and the hero
// model's build bakes it into car.glb as the material's own colour.
export type Paint = {
  id: string // saved in localStorage, so keep ids stable
  name: string
  color: string // sRGB hex
}

export const PAINTS: Paint[] = [
  { id: 'pearl', name: 'Pearl White', color: '#e6e6e2' },
  { id: 'quicksilver', name: 'Quicksilver', color: '#9aa1a8' },
  { id: 'red', name: 'Ultra Red', color: '#a0101c' },
  { id: 'blue', name: 'Deep Blue', color: '#123a8c' },
  { id: 'orange', name: 'Solar Orange', color: '#e0621a' },
  { id: 'black', name: 'Obsidian', color: '#141518' },
]
