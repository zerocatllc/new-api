/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useRef, type PointerEvent } from 'react'

export function usePointerTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  const handlePointerMove = (event: PointerEvent<T>) => {
    const surface = ref.current
    if (!surface) return

    const bounds = surface.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
    surface.style.setProperty('--landing-pointer-x', x.toFixed(3))
    surface.style.setProperty('--landing-pointer-y', y.toFixed(3))
  }

  const handlePointerLeave = () => {
    ref.current?.style.setProperty('--landing-pointer-x', '0')
    ref.current?.style.setProperty('--landing-pointer-y', '0')
  }

  return {
    ref,
    onPointerMove: handlePointerMove,
    onPointerLeave: handlePointerLeave,
  }
}
