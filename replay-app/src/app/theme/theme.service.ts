import { Injectable, signal, computed, effect } from '@angular/core';

// Adapted from the pinned reference (per
// Daxur-Daemon/cli/src/scaffold/recipes/angular-firebase-20/AGENT.md):
//   meowney (sibling project) @ b7cb672c1a0c0ee8aaef22b97823fb4b7bc81f7c
//   src/app/theme/theme.service.ts
//
// One deliberate deviation from the pin: getInitialTheme()'s final fallback
// is 'dark', not 'light'. replay-app's entire existing custom UI (nav,
// kitchen-sink, demo-gallery, replay-player, settings) was built dark-only
// from the start, so defaulting a fresh visitor with no stored preference
// and no system color-scheme signal to light would reintroduce the same
// light/dark mismatch this change exists to fix. System preference
// (prefers-color-scheme) is still checked first, same as the pin.

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  /**
   * Signal that stores the current theme.
   * Defaults to 'dark' if no preference is stored and no system preference
   * is detected (see class-level comment for why this differs from the pin).
   */
  private readonly themeSignal = signal<Theme>(this.getInitialTheme());

  /**
   * Public readonly signal for the current theme.
   */
  readonly theme = this.themeSignal.asReadonly();

  /**
   * Computed signal indicating if dark mode is active.
   */
  readonly isDarkMode = computed(() => this.themeSignal() === 'dark');

  /**
   * Computed signal indicating if light mode is active.
   */
  readonly isLightMode = computed(() => this.themeSignal() === 'light');

  constructor() {
    // Apply theme on initialization
    this.applyTheme(this.themeSignal());

    // Effect to persist theme changes to localStorage
    effect(() => {
      const currentTheme = this.themeSignal();
      localStorage.setItem('theme', currentTheme);
      this.applyTheme(currentTheme);
    });
  }

  /**
   * Get the initial theme from localStorage or system preference.
   */
  private getInitialTheme(): Theme {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }

    // No stored preference, no explicit system preference either way —
    // default dark to match this app's existing aesthetic (see class comment).
    return 'dark';
  }

  /**
   * Toggle between light and dark themes.
   */
  toggle(): void {
    const newTheme: Theme = this.themeSignal() === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  /**
   * Set a specific theme.
   */
  setTheme(theme: Theme): void {
    this.themeSignal.set(theme);
  }

  /**
   * Set dark theme.
   */
  setDarkMode(): void {
    this.setTheme('dark');
  }

  /**
   * Set light theme.
   */
  setLightMode(): void {
    this.setTheme('light');
  }

  /**
   * Apply the theme to the document element.
   */
  private applyTheme(theme: Theme): void {
    if (theme === 'dark') {
      document.documentElement.classList.add('app-dark-theme');
      document.documentElement.classList.remove('app-light-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('app-dark-theme');
      document.documentElement.classList.add('app-light-theme');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }
}
