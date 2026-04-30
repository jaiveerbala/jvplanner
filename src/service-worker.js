import { precacheAndRoute } from 'workbox-precaching'

// Precache all assets
precacheAndRoute(self.__WB_MANIFEST || [])

// Push notification handler
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'JV Planner', {
      body: data.body || '',
      icon: '/jvplanner/apple-touch-icon.png',
      badge: '/jvplanner/apple-touch-icon.png',
      tag: 'jvplanner-notification',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/jvplanner/'))
})
