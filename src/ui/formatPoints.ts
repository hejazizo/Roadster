// +1,500 / −500, with a real minus sign.
export const formatPoints = (points: number) => {
  const abs = Math.abs(points).toLocaleString('en-US')
  return points > 0 ? `+${abs}` : points < 0 ? `−${abs}` : '0'
}
