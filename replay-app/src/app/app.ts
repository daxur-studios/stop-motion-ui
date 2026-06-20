import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BusyService } from './shared/busy.service';

// App root — now routed via @angular/router (see ADR-007; supersedes
// ADR-005's original "no router" decision, which said a third view would
// be the trigger to revisit it). Nav is a row of routerLink anchors;
// <router-outlet> renders whichever of Replay Player / Demo Gallery /
// Kitchen Sink is active.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly busyService = inject(BusyService);
}
