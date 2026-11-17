import { defineDemo } from '@daxur-studios/stop-motion-ui';
import { fileURLToPath } from 'node:url';

export default defineDemo({
  baseURL: 'http://127.0.0.1:4237',
  viewport: { width: 960, height: 640 },
  narration: 'off',
  webServer: {
    command: [process.execPath, fileURLToPath(new URL('./fixture-server.mjs', import.meta.url))],
    url: 'http://127.0.0.1:4237',
  },
  async run({ page, demo }) {
    await page.goto('/');
    await demo.capture({ id: 'start', narration: 'This project has unsaved changes.' });
    await demo.click(page.getByRole('button', { name: 'Save changes' }), {
      id: 'save', narration: 'Save the changes.',
      ready: async page => page.getByRole('status').filter({ hasText: 'Changes saved' }).waitFor(),
    });
    await demo.scrollTo(600, { id: 'details-scroll' });
    await demo.click(page.getByRole('button', { name: 'Show details' }), {
      id: 'details', narration: 'The project details are ready.',
      ready: async page => page.getByText('Project ready', { exact: true }).waitFor(),
    });
  },
});
