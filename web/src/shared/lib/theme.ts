/** 消し込むほど強くなる発光。0 で消灯、1 が既定、2 で最大。 */
export const GLOW = 1;

export function glowShadow(px: number, alpha: number, g: number = GLOW) {
  return '0 0 ' + px * g + 'px rgba(56, 229, 255, ' + alpha * g + ')';
}
