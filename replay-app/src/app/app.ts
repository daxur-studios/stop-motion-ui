import { Component, inject, signal } from '@angular/core';
import { ReplayPlayerComponent } from './replay-player/replay-player.component';
import { DemoGalleryComponent } from './demo-gallery/demo-gallery.component';
import { BusyService } from './shared/busy.service';

// App root — simple two-view shell (Replay Player / Demo Gallery), no
// @angular/router. Adding a router for two views wasn't worth the extra
// dependency in a utility app this small; see ADR-005 for the reasoning.
type View = 'replay' | 'demos';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReplayPlayerComponent, DemoGalleryComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly busyService = inject(BusyService);
  protected readonly view = signal<View>('replay');

  setView(next: View): void {
    this.view.set(next);
  }
}
