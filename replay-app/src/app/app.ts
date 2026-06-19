import { Component, inject, signal } from '@angular/core';
import { ReplayPlayerComponent } from './replay-player/replay-player.component';
import { DemoGalleryComponent } from './demo-gallery/demo-gallery.component';
import { KitchenSinkComponent } from './kitchen-sink/kitchen-sink.component';
import { BusyService } from './shared/busy.service';

// App root — simple view shell (Replay Player / Demo Gallery / Kitchen
// Sink), no @angular/router. Adding a router wasn't worth the extra
// dependency for same-tab view toggling; see ADR-005 for the original
// two-view reasoning — "kitchen-sink" is the third view ADR-005 said would
// prompt revisiting that decision if it ever showed up. Still no
// deep-linking need for a test fixture, so the plain signal toggle stays.
type View = 'replay' | 'demos' | 'kitchen-sink';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReplayPlayerComponent, DemoGalleryComponent, KitchenSinkComponent],
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
