import { Routes } from '@angular/router';
import { roomSessionGuard } from './core/room-session.guard';
import { Account } from './pages/account/account';
import { CreateRoom } from './pages/create-room/create-room';
import { Home } from './pages/home/home';
import { JoinRoom } from './pages/join-room/join-room';
import { RoomPage } from './pages/room/room';

export const routes: Routes = [
  { path: '', component: Home, title: 'WhoAmI' },
  { path: 'create', component: CreateRoom, title: 'Create a room · WhoAmI' },
  { path: 'join', component: JoinRoom, title: 'Join a room · WhoAmI' },
  { path: 'join/:code', component: JoinRoom, title: 'Join a room · WhoAmI' },
  { path: 'room/:code', component: RoomPage, title: 'Room · WhoAmI', canActivate: [roomSessionGuard] },
  { path: 'account', component: Account, title: 'Your account · WhoAmI' },
  { path: '**', redirectTo: '' },
];
