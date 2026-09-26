import { handleApi } from '../server/core.js'

export function GET(request) {
  return handleApi(request)
}
