import '@fontsource-variable/cormorant-garamond/wght.css'
import '@fontsource-variable/cormorant-garamond/wght-italic.css'
import '@fontsource-variable/dm-sans/wght.css'
import './styles/index.css'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { AuthProvider } from './lib/auth'
import { envError } from './lib/env'

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    {envError ? (
      <p style={{ padding: '2rem', fontFamily: 'Georgia, serif' }}>{envError}</p>
    ) : (
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </MotionConfig>
    )}
  </StrictMode>,
)
