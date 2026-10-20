import { Routes } from '@angular/router';
import { CreateRoom } from './pages/create-room/create-room';
import { Home } from './pages/home/home';
import { JoinRoom } from './pages/join-room/join-room';

export const routes: Routes = [
  { path: '', component: Home, title: 'WhoAmI' },
  { path: 'create', component: CreateRoom, title: 'Create a room · WhoAmI' },
  { path: 'join', component: JoinRoom, title: 'Join a room · WhoAmI' },
  { path: 'join/:code', component: JoinRoom, title: 'Join a room · WhoAmI' },
  { path: '**', redirectTo: '' },
];