// Translate only desktop input commands. File access, shell commands, drivers,
// system settings and other Pro protocol operations are intentionally unsupported.
const pressed = new Set<number>();
const heldButtons = new Set<number>();

export async function officialInput(
  nut: any,
  input: any,
  size: { width: number; height: number }
) {
  if (!input || typeof input.type !== 'string')
    throw new Error('Invalid input');
  const kind = input.type
    .replace(/^ibInput/, '')
    .replace(/^Mouse/, 'mouse')
    .replace(/^Keyboard/, 'keyboard');
  const number = (value: unknown, limit: number) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > limit
    )
      throw new Error('Invalid input coordinate');
    return value;
  };
  if (kind === 'mouseMove') {
    const x = number(input.x, 1),
      y = number(input.y, 1);
    await nut.mouse.setPosition({
      x: Math.round(Math.max(0, x) * (size.width - 1)),
      y: Math.round(Math.max(0, y) * (size.height - 1)),
    });
  } else if (kind === 'mouseMoveRel') {
    const dx = number(input.dx, 10000),
      dy = number(input.dy, 10000);
    const point = await nut.mouse.getPosition();
    await nut.mouse.setPosition({
      x: Math.max(0, Math.min(size.width - 1, Math.round(point.x + dx))),
      y: Math.max(0, Math.min(size.height - 1, Math.round(point.y + dy))),
    });
  } else if (/^mouse(Left|Right|Middle)Button(Press|Release)$/.test(kind)) {
    const match = kind.match(
      /^mouse(Left|Right|Middle)Button(Press|Release)$/
    )!;
    const button = nut.Button[match[1].toUpperCase()];
    if (match[2] === 'Press') {
      await nut.mouse.pressButton(button);
      heldButtons.add(button);
    } else {
      await nut.mouse.releaseButton(button);
      heldButtons.delete(button);
    }
  } else if (kind === 'mouseScroll') {
    const dx = number(input.dx || 0, 10000),
      dy = number(input.dy || 0, 10000);
    if (dy)
      await nut.mouse[dy > 0 ? 'scrollDown' : 'scrollUp'](
        Math.max(1, Math.round(Math.abs(dy) / 120))
      );
    if (dx)
      await nut.mouse[dx > 0 ? 'scrollRight' : 'scrollLeft'](
        Math.max(1, Math.round(Math.abs(dx) / 120))
      );
  } else if (kind === 'keyboardPressKey' || kind === 'keyboardReleaseKey') {
    const keys = input.key;
    const allowed = new Set(
      Object.values(nut.Key).filter((v) => typeof v === 'number')
    );
    if (
      !Array.isArray(keys) ||
      !keys.length ||
      keys.length > 16 ||
      keys.some((key) => !allowed.has(key))
    )
      throw new Error('Invalid key');
    if (kind === 'keyboardPressKey') {
      await nut.keyboard.pressKey(...keys);
      keys.forEach((key) => pressed.add(key));
    } else {
      await nut.keyboard.releaseKey(...keys);
      keys.forEach((key) => pressed.delete(key));
    }
  } else if (
    kind === 'keyboardReleaseAllKey' ||
    kind === 'keyboardReleaseAllPressKey' ||
    kind === 'releaseAll'
  ) {
    if (pressed.size) await nut.keyboard.releaseKey(...pressed);
    pressed.clear();
    for (const button of heldButtons) await nut.mouse.releaseButton(button);
    heldButtons.clear();
  } else {
    throw new Error('Unsupported desktop input command');
  }
}
