import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { BillingItem } from '../../models/financial.models';

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  template: `
    <div class="kanban-board">
      <div class="kanban-column" *ngFor="let column of columns">
        <div class="column-header">
          <h3>{{ column.title }}</h3>
          <span class="column-count">{{ getItemsForColumn(column.status).length }}</span>
        </div>
        <div
          class="column-content"
          cdkDropList
          [id]="column.status"
          [cdkDropListData]="getItemsForColumn(column.status)"
          (cdkDropListDropped)="drop($event)">
          <div
            class="kanban-card"
            *ngFor="let item of getItemsForColumn(column.status); trackBy: trackById"
            cdkDrag
            (click)="onCardClick(item)">
            <div class="card-header">
              <span class="store-name">{{ item.storeName }}</span>
              <span class="nfs-number">NFS #{{ item.nfsNumber }}</span>
            </div>
            <div class="card-body">
              <div class="card-date">{{ formatDate(item.date) }}</div>
              <div class="card-amount">{{ formatCurrency(item.finalAmount) }}</div>
              <div class="card-status" [class]="'status-' + item.status.toLowerCase()">
                {{ item.status }}
              </div>
            </div>
            <div class="card-footer" *ngIf="item.notes">
              <small>{{ item.notes }}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .kanban-board {
      display: flex;
      gap: 20px;
      height: 600px;
      overflow-x: auto;
      padding: 20px 0;
    }

    .kanban-column {
      flex: 1;
      min-width: 300px;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #e9ecef;
    }

    .column-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: white;
      border-bottom: 1px solid #e9ecef;
      border-radius: 8px 8px 0 0;
    }

    .column-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #495057;
    }

    .column-count {
      background: #6c757d;
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }

    .column-content {
      padding: 16px;
      height: 520px;
      overflow-y: auto;
    }

    .kanban-card {
      background: white;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .kanban-card:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      transform: translateY(-1px);
    }

    .kanban-card:active {
      cursor: grabbing;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }

    .store-name {
      font-weight: 600;
      color: #495057;
      font-size: 14px;
    }

    .nfs-number {
      font-size: 12px;
      color: #6c757d;
      background: #f8f9fa;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .card-body {
      margin-bottom: 8px;
    }

    .card-date {
      font-size: 12px;
      color: #6c757d;
      margin-bottom: 4px;
    }

    .card-amount {
      font-size: 16px;
      font-weight: 600;
      color: #28a745;
      margin-bottom: 4px;
    }

    .card-status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .status-pendente {
      background: #fff3cd;
      color: #856404;
    }

    .status-faturado {
      background: #cce5ff;
      color: #004085;
    }

    .status-pago {
      background: #d4edda;
      color: #155724;
    }

    .card-footer {
      border-top: 1px solid #f8f9fa;
      padding-top: 8px;
      margin-top: 8px;
    }

    .card-footer small {
      color: #6c757d;
      font-size: 11px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .kanban-board {
        flex-direction: column;
        height: auto;
      }

      .kanban-column {
        min-width: unset;
        margin-bottom: 20px;
      }

      .column-content {
        height: 300px;
      }
    }
  `]
})
export class KanbanBoardComponent {
  @Input() items: BillingItem[] = [];
  @Output() itemMoved = new EventEmitter<{item: BillingItem, newStatus: string}>();
  @Output() cardClicked = new EventEmitter<BillingItem>();

  columns = [
    { title: 'Pendente', status: 'PENDENTE' },
    { title: 'Faturado', status: 'FATURADO' },
    { title: 'Pago', status: 'PAGO' }
  ];

  getItemsForColumn(status: string): BillingItem[] {
    return this.items.filter(item => item.status === status);
  }

  drop(event: CdkDragDrop<BillingItem[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );

      const item = event.container.data[event.currentIndex];
      const newStatus = event.container.id as 'PENDENTE' | 'FATURADO' | 'PAGO';

      // Update item status
      item.status = newStatus;

      this.itemMoved.emit({ item, newStatus });
    }
  }

  onCardClick(item: BillingItem) {
    this.cardClicked.emit(item);
  }

  trackById(index: number, item: BillingItem): string {
    return item.id;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('pt-BR');
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }
}