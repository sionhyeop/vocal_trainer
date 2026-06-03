// router.tsx — react-router 6 라우트 정의
// 루트 레이아웃에 errorElement를 달아 모든 에러를 친절한 화면으로, '*'로 404를 처리한다.
import { createBrowserRouter, Outlet } from 'react-router-dom'
import HomePage from '../features/home/HomePage'
import SearchPage from '../features/search/SearchPage'
import ChartPage from '../features/chart/ChartPage'
import SingScreen from '../features/sing/SingScreen'
import MicTestPage from '../features/training/MicTestPage'
import GamesHub from '../features/games/GamesHub'
import ClimberGame from '../features/games/ClimberGame'
import EchoGame from '../features/games/EchoGame'
import EarGame from '../features/games/EarGame'
import HistoryScreen from '../features/history/HistoryScreen'
import ProfilePage from '../features/profile/ProfilePage'
import NoteMapViewPage from '../features/notemap/NoteMapViewPage'
import StatusPage from '../features/status/StatusPage'
import ErrorPage from '../features/error/ErrorPage'

function Root() {
  return <Outlet />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'chart', element: <ChartPage /> },
      { path: 'sing/:videoId', element: <SingScreen /> },
      { path: 'games', element: <GamesHub /> },
      { path: 'games/climber', element: <ClimberGame /> },
      { path: 'games/echo', element: <EchoGame /> },
      { path: 'games/ear', element: <EarGame /> },
      { path: 'history', element: <HistoryScreen /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'mic-test', element: <MicTestPage /> },
      { path: 'notemap', element: <NoteMapViewPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: '*', element: <ErrorPage /> },
    ],
  },
])
