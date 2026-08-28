import { defineConfig } from 'vite'

// base './' 相对路径,Cloudflare Pages / 任意静态目录均可直接托管
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 900,
  },
})
