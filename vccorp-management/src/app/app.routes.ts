import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'overview', pathMatch: 'full' },
  { path: 'overview', loadComponent: () => import('./components/overview/overview.component').then(m => m.OverviewComponent) },
  { path: 'campaigns', loadComponent: () => import('./components/campaigns/campaigns.component').then(m => m.CampaignsComponent) },
  { path: 'journey', loadComponent: () => import('./components/journey/journey.component').then(m => m.JourneyComponent) },
  { path: 'prediction', loadComponent: () => import('./components/prediction/prediction.component').then(m => m.PredictionComponent) }
];

