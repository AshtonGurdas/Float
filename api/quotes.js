import { handleApi } from '../server/core.js'

export const maxDuration = 60

export function POST(request) {
  return handleApi(request)
}
