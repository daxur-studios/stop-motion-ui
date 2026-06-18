import { Component } from '@angular/core';
import { ReplayPlayerComponent } from './replay-player/replay-player.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReplayPlayerComponent],
  template: '<app-replay-player />',
})
export class App {}
