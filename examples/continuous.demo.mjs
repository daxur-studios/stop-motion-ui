import { defineVideo } from '@daxur-studios/stop-motion-ui';

// Copy fixture-server.mjs alongside this recipe. Use the same command as defineDemo:
// stop-motion-ui run demos/continuous.demo.mjs --out artifacts/demos --json
export default defineVideo({
  baseURL: 'http://127.0.0.1:4237',
  webServer: {
    command: [process.execPath, 'demos/fixture-server.mjs'],
    url: 'http://127.0.0.1:4237',
  },
  narration: 'off',
  segments: [
    { id: 'intro', caption: 'A continuous walkthrough' },
    { id: 'save', caption: 'The pointer arrives before pressing' },
    { id: 'wait', caption: 'The real wait, shown at 3×', speed: 3 },
    { id: 'result', caption: 'Saved' },
  ],
  async ready(page) { await page.goto('/?saveDelayMs=3000'); await page.getByRole('button', { name: 'Save changes' }).waitFor(); },
  async run({ page, video }) {
    await video.segment('intro', async () => { await video.hold(900); });
    await video.segment('save', async () => { await video.click(page.getByRole('button', { name: 'Save changes' })); });
    await video.segment('wait', async () => {
      await page.getByText('Changes saved', { exact: true }).waitFor();
    });
    await video.segment('result', async () => { await video.hold(1200); });
  },
});
