import { Routes } from '@angular/router';
import { CreateRoom } from './pages/create-room/create-room';
import { Home } from './pages/home/home';

export const routes: Routes = [
  { path: '', component: Home, title: 'WhoAmI' },
  { path: 'create', component: CreateRoom, title: 'Create a room · WhoAmI' },
  { path: '**', redirectTo: '' },
];