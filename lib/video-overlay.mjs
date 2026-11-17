/** Browser-rendered overlays need no platform font files or FFmpeg text escaping. */
export async function installVideoOverlay(page, pointer) {
  await page.evaluate(({ x, y }) => {
    const host = document.createElement('div');
    host.id = '__stop-motion-video';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{pointer-events:none!important}*{box-sizing:border-box}
      #pointer{position:absolute;width:24px;height:30px;background:#fff4cc;clip-path:polygon(0 0,0 85%,24% 65%,43% 100%,60% 91%,42% 59%,78% 59%);filter:drop-shadow(1px 2px 2px #000)}
      #pointer.pressed{background:#a9e7a6}
      #caption,#speed{position:absolute;color:white;background:#10141bde;border-radius:8px;padding:10px 16px;font:600 18px/1.4 system-ui,sans-serif;white-space:pre-wrap}
      #caption{bottom:22px;left:24px;right:24px;text-align:center}#speed{right:24px;top:22px;color:#e6edc9}
      [hidden]{display:none!important}
    </style><div id="pointer"></div><div id="caption" hidden></div><div id="speed" hidden></div>`;
    document.documentElement.append(host);
    const cursor = root.getElementById('pointer');
    cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
    document.addEventListener('pointermove', e => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; }, true);
    document.addEventListener('pointerdown', () => cursor.classList.add('pressed'), true);
    document.addEventListener('pointerup', () => cursor.classList.remove('pressed'), true);
  }, pointer);
}
export async function setVideoCaption(page, { caption, speed }) {
  await page.evaluate(({ caption, speed }) => {
    const root = document.getElementById('__stop-motion-video')?.shadowRoot;
    if (!root) throw new Error('Video overlay lost; navigate in ready(), before recording starts');
    const label = root.getElementById('caption'), badge = root.getElementById('speed');
    label.textContent = caption || ''; label.hidden = !caption;
    badge.textContent = `${speed}× SPEED`; badge.hidden = speed === 1;
  }, { caption, speed });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
