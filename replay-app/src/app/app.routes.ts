import { Routes } from '@angular/router';
import { ReplayPlayerComponent } from './replay-player/replay-player.component';
import { DemoGalleryComponent } from './demo-gallery/demo-gallery.component';
import { KitchenSinkComponent } from './kitchen-sink/kitchen-sink.component';
import { SettingsComponent } from './settings/settings.component';

// Real routes — supersedes ADR-005's "no router" decision now that there
// are three views and a user-requested need for real URL navigation
// (rather than an in-memory signal toggle). See ADR-007.
//
// Flat, no nesting/guards: this is still a small test-fixture app, not a
// real product surface.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'replay' },
  { path: 'replay', component: ReplayPlayerComponent },
  { path: 'demos', component: DemoGalleryComponent },
  { path: 'kitchen-sink', component: KitchenSinkComponent },
  { path: 'settings', component: SettingsComponent },
  { path: '**', redirectTo: 'replay' },
];
