import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login.component';
import { LayoutComponent } from './layout/layout.component';
import { DashboardHomeComponent } from './features/dashboard/dashboard-home.component';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        component: DashboardHomeComponent
      },
      {
        path: 'properties',
        loadComponent: () => import('./features/properties/properties-crm.component').then(m => m.PropertiesCrmComponent)
      },
      {
        path: 'agents',
        loadComponent: () => import('./features/agents/agents-management.component').then(m => m.AgentsManagementComponent),
        canActivate: [roleGuard],
        data: { roles: ['Admin'] }
      },
      {
        path: 'users',
        redirectTo: 'agents'
      },
      {
        path: 'scans',
        loadComponent: () => import('./features/scan-jobs/scan-jobs-monitor.component').then(m => m.ScanJobsMonitorComponent)
      },
      {
        path: 'studio/:scanId',
        loadComponent: () => import('./features/studio/studio-wrapper.component').then(m => m.StudioWrapperComponent)
      },
      {
        path: 'studio',
        loadComponent: () => import('./features/studio/studio-wrapper.component').then(m => m.StudioWrapperComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
