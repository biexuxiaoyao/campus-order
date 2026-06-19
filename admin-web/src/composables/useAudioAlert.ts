import { ref } from 'vue'

const enabled = ref(localStorage.getItem('audioAlertEnabled') !== 'false')

export function useAudioAlert() {
  function playBeep() {
    if (!enabled.value) return
    try {
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.3)

      // Clean up context after beep
      setTimeout(() => ctx.close(), 500)
    } catch (e) {
      console.warn('[AudioAlert] 音频播放失败', e)
    }
  }

  function toggle() {
    enabled.value = !enabled.value
    localStorage.setItem('audioAlertEnabled', String(enabled.value))
  }

  return { playBeep, toggle, enabled }
}
