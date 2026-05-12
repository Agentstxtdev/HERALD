import { createPaymentProxy } from '@herald/addon/nextjs'
import agenticConfig from './agentic.config.js'

export default createPaymentProxy(agenticConfig, '/api')

export const config = {
  matcher: ['/api/:path*'],
}
