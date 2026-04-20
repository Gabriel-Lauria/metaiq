import { Component, Input, ChangeDetectionStrategy, OnInit, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';

/**
 * Componente de Virtual Scrolling para listas grandes
 * Melhora performance ao renderizar apenas items visíveis
 * 
 * Uso:
 * <app-virtual-list [items]="campaigns" [itemHeight]="80">
 *   <ng-template #itemTemplate let-item>
 *     <div class="campaign-item">{{ item.name }}</div>
 *   </ng-template>
 * </app-virtual-list>
 */
@Component({
  selector: 'app-virtual-list',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  template: `
    <cdk-virtual-scroll-viewport 
      [itemSize]="itemHeight" 
      class="virtual-list-viewport"
      [ngStyle]="{ height: containerHeight }"
    >
      <div *cdkVirtualFor="let item of items; let i = index" 
           class="virtual-list-item"
           [ngStyle]="{ height: itemHeight + 'px' }">
        <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: item, index: i }"></ng-container>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
  styles: [`
    .virtual-list-viewport {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-surface);
      overflow-y: auto;
    }

    .virtual-list-item {
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      padding: 0 16px;
      background: var(--color-surface);
      transition: background-color 0.2s ease;
    }

    .virtual-list-item:hover {
      background: var(--color-background);
    }

    .virtual-list-item:last-child {
      border-bottom: none;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VirtualListComponent<T> implements OnInit {
  @Input() items: T[] = [];
  @Input() itemHeight: number = 60;
  @Input() containerHeight: string = '600px';
  @Input() itemTemplate: any;

  ngOnInit(): void {
    // Virtual scrolling é aplicado automaticamente pelo CDK
  }
}

/**
 * Versão simplificada com rendering básico
 */
@Component({
  selector: 'app-virtual-list-simple',
  standalone: true,
  imports: [CommonModule, ScrollingModule],
  template: `
    <div class="virtual-list-container" [ngStyle]="{ height: containerHeight, overflow: 'auto' }">
      <div class="virtual-list-spacer" [ngStyle]="{ height: spacerHeight + 'px' }"></div>
      <div *ngFor="let item of visibleItems" class="virtual-list-item" [ngStyle]="{ height: itemHeight + 'px' }">
        <ng-container *ngTemplateOutlet="itemTemplate; context: { $implicit: item }"></ng-container>
      </div>
      <div class="virtual-list-spacer" [ngStyle]="{ height: bottomSpacerHeight + 'px' }"></div>
    </div>
  `,
  styles: [`
    .virtual-list-container {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      overflow-y: auto;
      background: var(--color-surface);
    }

    .virtual-list-item {
      display: flex;
      align-items: center;
      padding: 0 16px;
      border-bottom: 1px solid var(--color-border);
      transition: background-color 0.2s ease;
    }

    .virtual-list-item:hover {
      background: var(--color-background);
    }

    .virtual-list-spacer {
      background: transparent;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VirtualListSimpleComponent<T> implements OnInit {
  @Input() items: T[] = [];
  @Input() itemHeight: number = 60;
  @Input() containerHeight: string = '600px';
  @Input() itemTemplate: any;
  @Input() bufferSize: number = 5;

  visibleItems = signal<T[]>([]);
  spacerHeight = signal(0);
  bottomSpacerHeight = signal(0);

  ngOnInit(): void {
    this.updateVisibleItems();
  }

  private updateVisibleItems(): void {
    // Implementar lógica de scroll para atualizar items visíveis
    const containerHeightNum = parseInt(this.containerHeight);
    const visibleCount = Math.ceil(containerHeightNum / this.itemHeight) + this.bufferSize;
    const startIdx = 0;
    const endIdx = Math.min(startIdx + visibleCount, this.items.length);

    this.visibleItems.set(this.items.slice(startIdx, endIdx));
    this.spacerHeight.set(startIdx * this.itemHeight);
    this.bottomSpacerHeight.set(Math.max(0, (this.items.length - endIdx) * this.itemHeight));
  }
}
