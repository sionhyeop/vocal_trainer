// providers.tsx — 앱 최상위 프로바이더 래퍼 (M0: 라우터만)
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

export default function Providers() {
  return <RouterProvider router={router} />
}
