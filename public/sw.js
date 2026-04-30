self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'JV Planner', {
      body: data.body || '',
      icon: data.icon || '/jvplanner/apple-touch-icon.png',
      badge: '/jvplanner/apple-touch-icon.png',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow('/jvplanner/')
  )
})
