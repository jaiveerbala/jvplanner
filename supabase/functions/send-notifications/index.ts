import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// VAPID keys
const VAPID_PUBLIC = 'BP7mdLKwdCvLxXATEfMYAWGi3HNloRWi5jeqcMtSVQ1NPpQaguhTJH7IcBpEhJzbDdPq9un0LZ070OOhBIdkrWg'
const VAPID_PRIVATE = '3rNS66PDMGUKtwKo0os3AYyVgIxbbi7XUI3WcfdNQBw'
const VAPID_SUBJECT = 'mailto:jaiveerbala@gmail.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const currentDate = now.toISOString().slice(0, 10)
    const currentHour = now.getUTCHours().toString().padStart(2, '0')
    const currentMin = now.getUTCMinutes().toString().padStart(2, '0')
    const currentTime = `${currentHour}:${currentMin}`

    // Find tasks due right now (within this minute)
    const { data: dueTasks } = await supabase
      .from('events')
      .select('*, push_subscriptions!inner(subscription)')
      .eq('start_date', currentDate)
      .eq('start_time', currentTime + ':00')
      .eq('completed', false)

    if (!dueTasks || dueTasks.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get all push subscriptions
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let sent = 0
    for (const task of dueTasks) {
      for (const sub of subscriptions) {
        if (sub.user_id !== task.user_id) continue
        try {
          await sendPushNotification(sub.subscription, {
            title: task.title,
            body: `Due now · ${task.tab}`,
            icon: '/jvplanner/apple-touch-icon.png',
          })
          sent++
        } catch (e) {
          console.error('Push failed:', e)
          // Remove invalid subscription
          if (e.message?.includes('410') || e.message?.includes('404')) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function sendPushNotification(subscription: any, payload: any) {
  const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription
  
  const header = {
    typ: 'JWT',
    alg: 'ES256'
  }

  const now = Math.floor(Date.now() / 1000)
  const claims = {
    aud: new URL(sub.endpoint).origin,
    exp: now + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  }

  // Import the private key
  const privateKeyBytes = base64urlDecode(VAPID_PRIVATE)
  const privateKey = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  )

  // For simplicity use the web-push compatible approach
  const jwt = await createVAPIDJWT(header, claims, VAPID_PRIVATE)
  
  const payloadStr = JSON.stringify(payload)
  const payloadBytes = new TextEncoder().encode(payloadStr)

  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC}`,
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body: payloadBytes,
  })

  if (!response.ok) {
    throw new Error(`Push failed: ${response.status}`)
  }
}

async function createVAPIDJWT(header: any, claims: any, privateKeyB64: string): Promise<string> {
  const encodedHeader = base64urlEncode(JSON.stringify(header))
  const encodedClaims = base64urlEncode(JSON.stringify(claims))
  const signingInput = `${encodedHeader}.${encodedClaims}`
  
  const keyBytes = base64urlDecode(privateKeyB64)
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  )
  
  return `${signingInput}.${base64urlEncode(signature)}`
}

function base64urlEncode(data: string | ArrayBuffer): string {
  let bytes: Uint8Array
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data)
  } else {
    bytes = new Uint8Array(data)
  }
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')
  const binary = atob(padded)
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)))
}
