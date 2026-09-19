import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles/index.css'
import { Login } from './pages/Login'
import { Layout } from './pages/Layout'
import { TableEditor } from './pages/TableEditor'
import { StorageManager } from './pages/StorageManager'
import { Settings } from './pages/Settings'

const router = createBrowserRouter([
  { path: '/studio/login', element: <Login /> },
  {
    path: '/studio',
    element: <Layout />,
    children: [
      { index: true, element: <TableEditor /> },
      { path: 'storage', element: <StorageManager /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
