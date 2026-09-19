/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export function SignalMountainRelief() {
  return (
    <img
      data-testid='signal-mountain-relief'
      data-rendering='photographic-relief'
      src='/landing-mountain-relief.webp'
      alt=''
      aria-hidden='true'
      draggable={false}
      decoding='async'
      className='landing-mountain-relief pointer-events-none absolute bottom-[-24px] left-[12%] hidden w-[105%] opacity-35 select-none lg:block dark:opacity-20'
    />
  )
}
