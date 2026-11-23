import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { HeaderComponent } from './header.component';
import { I18nService } from '../core/services/i18n.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent, HeaderComponent],
  template: `
    <div class="app-layout" [attr.dir]="i18n.dir()">
      <app-sidebar></app-sidebar>
      
      <div class="main-wrapper">
        <app-header></app-header>
        
        <main class="page-content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .app-layout {
      display: flex;
      min-height: 100vh;
      width: 100%;
      background-color: var(--bg-body, #0b1120);
    }

    .main-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .page-content {
      flex: 1;
      padding: 1.5rem;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }
  `]
})
export class LayoutComponent {
  readonly i18n = inject(I18nService);
}
