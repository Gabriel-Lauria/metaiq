import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

interface TableColumn {
  key: string;
  label: string;
}

@Component({
  selector: 'app-ui-data-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="data-table-wrapper">
      <table class="data-table" *ngIf="data?.length; else emptyState">
        <thead>
          <tr>
            <th *ngFor="let column of columns">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of data; trackBy: trackByIndex">
            <td *ngFor="let column of columns">{{ row[column.key] }}</td>
          </tr>
        </tbody>
      </table>

      <ng-template #emptyState>
        <div class="table-empty">{{ emptyText || 'Nenhum registro encontrado.' }}</div>
      </ng-template>
    </div>
  `,
  styles: [`
    .data-table-wrapper {
      overflow-x: auto;
      width: 100%;
    }

    .data-table {
      width: 100%;
      min-width: 720px;
      border-collapse: collapse;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
    }

    th,
    td {
      padding: 16px 18px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
      color: var(--text);
    }

    th {
      background: #f8fafc;
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 12px;
    }

    tbody tr:hover {
      background: #f8fafc;
    }

    .table-empty {
      padding: 28px;
      border-radius: 18px;
      background: #ffffff;
      border: 1px solid var(--border);
      color: var(--text-muted);
      text-align: center;
      min-height: 140px;
      display: grid;
      place-items: center;
    }

    @media (max-width: 760px) {
      .data-table {
        min-width: 100%;
      }

      th,
      td {
        padding: 12px 14px;
        font-size: 13px;
      }
    }
  `]
})
export class UiDataTableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() data: Record<string, unknown>[] = [];
  @Input() emptyText = 'Nenhum registro encontrado.';

  trackByIndex(index: number) {
    return index;
  }
}
