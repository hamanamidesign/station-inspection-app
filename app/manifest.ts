// app/manifest.ts

import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '駅構内点検アプリ',
    short_name: '駅点検',
    start_url: '/',
    display: 'standalone',
    background_color: '#502100',
    theme_color: '#f97316',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}