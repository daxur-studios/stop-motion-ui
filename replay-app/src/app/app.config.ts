import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

// @angular/router added (see ADR-007, supersedes ADR-005's original
// "no router" call) now that there are three real views and a need for
// actual URL navigation rather than an in-memory signal toggle.
//
// provideAnimationsAsync() is required by Angular Material (mat-select,
// mat-dialog, mat-progress-bar/-spinner all use it) — added for the
// kitchen-sink demo page; see replay-app/src/app/kitchen-sink/. Material is
// confirmed compatible with provideZonelessChangeDetection() as of v20.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
  ],
};
