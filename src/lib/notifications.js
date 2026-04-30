import { supabase } from './supabase'

const VAPID_PUBLIC = 'BP7mdLKwdCvLxXATEfMYAWGi3HNloRWi5jeqcMtSVQ1NPpQaguhTJH7IcBpEhJzbDdPq9un0LZ070OOhBIdkrWg'

export async function requestNotificationPermission(userId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { success: false, reason: 'not supported' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { success: false, reason: 'denied' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) await existing.unsubscribe()

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    })

    // Save subscription to Supabase
    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      subscription: JSON.stringify(subscription),
      created_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    return { success: true }
  } catch (e) {
    return { success: false, reason: e.message }
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}
