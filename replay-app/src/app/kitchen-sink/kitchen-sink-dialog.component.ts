import { Component } from '@angular/core';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

// Minimal mat-dialog content — exists purely so a capture run has a real
// dialog to open/close (data-testid coverage per the demo-readiness-check
// skill). No inputs/outputs; nothing for the caller to wire up beyond
// `MatDialog.open(KitchenSinkDialogComponent)`.
@Component({
  selector: 'app-kitchen-sink-dialog',
  standalone: true,
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose],
  template: `
    <h2 mat-dialog-title data-testid="kitchen-sink-dialog">Demo dialog</h2>
    <mat-dialog-content data-testid="kitchen-sink-dialog-content">
      <p>
        This is a deliberately simple dialog — just enough content to exercise
        dialog-open/close in a stop-motion-ui capture/replay run.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-dialog-close data-testid="kitchen-sink-dialog-close">Close</button>
    </mat-dialog-actions>
  `,
})
export class KitchenSinkDialogComponent {}
