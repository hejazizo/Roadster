// +500 / −500, with a real minus sign.
export const formatPoints = (points: number) =>
  points > 0 ? `+${points}` : points < 0 ? `−${-points}` : '0'
