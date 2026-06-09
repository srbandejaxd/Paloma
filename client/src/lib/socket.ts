import { io } from 'socket.io-client'

const URL = import.meta.env.VITE_SERVER_URL ?? ''

let socket: ReturnType<typeof io>

export function getSocket() {
  if (!socket) {
    socket = io(URL, { transports: ['websocket', 'polling'] })
  }
  return socket
}
