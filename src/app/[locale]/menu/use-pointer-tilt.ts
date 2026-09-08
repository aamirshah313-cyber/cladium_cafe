'use client';

/**
 * A few degrees of pointer-follow tilt on the featured dish.
 *
 * ## Why this is deliberately tiny
 *
 * The reference clip's plate is a disc shot from directly above and cut out
 * against a dark ground, so it can be swung around convincingly. Cladium's
 * pictures are rectangular scenes photographed from an angle. Rotating one
 * far enough to read as "3D" would show the eye a plane where it expects a
 * plate and reveal the illusion instead of selling it.
 *
 * So the ceiling is `MAX_DEGREES`, which is enough for the picture to feel
 * like an object sitting on the stage and not enough to look like a spinning
 * product demo. The stage's arc, plinth and contact shadow are doing the
 * real work; this only makes them respond.
 *
 * ## Where it does not run
 *
 * - `prefers-reduced-motion: reduce` — no listener is attached at all, so
 *   there is no path by which a stray pointer event can move anything.
 * - `pointer: coarse` — on a touch screen there is no hovering pointer to
 *   follow, and reading finger position mid-scroll would fight the gesture.
 * - Before first pointer contact, and after the pointer leaves: the tilt
 *   returns to zero rather than freezing at its last angle.
 *
 * Both media queries are watched live rather than read once, because a
 * laptop with a touchscreen can switch between them and the OS
 * reduced-motion setting can change while the page is open.
 */

import { useEffect, useRef } from 'react';

/** The most the picture may tilt on either axis. */
const MAX_DEGREES = 4;

export function usePointerTilt<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof window.matchMedia !== 'function') return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');

    let attached = false;

    function clear() {
      element?.style.removeProperty('--tilt-x');
      element?.style.removeProperty('--tilt-y');
    }

    function onPointerMove(event: PointerEvent) {
      if (element === null) return;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      // -1..1 from the centre of the stage, then scaled to the cap. The Y
      // input drives rotateX and is negated so moving the pointer up tips
      // the top of the picture away, which is the direction that reads as
      // the object leaning back rather than falling forward.
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      element.style.setProperty('--tilt-y', `${(x * MAX_DEGREES * 2).toFixed(2)}deg`);
      element.style.setProperty('--tilt-x', `${(-y * MAX_DEGREES * 2).toFixed(2)}deg`);
    }

    function sync() {
      const wanted = finePointer.matches && !reduceMotion.matches;
      if (wanted === attached) return;
      if (wanted) {
        element?.addEventListener('pointermove', onPointerMove);
        element?.addEventListener('pointerleave', clear);
      } else {
        element?.removeEventListener('pointermove', onPointerMove);
        element?.removeEventListener('pointerleave', clear);
        clear();
      }
      attached = wanted;
    }

    sync();
    reduceMotion.addEventListener('change', sync);
    finePointer.addEventListener('change', sync);

    return () => {
      reduceMotion.removeEventListener('change', sync);
      finePointer.removeEventListener('change', sync);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', clear);
      clear();
    };
  }, []);

  return ref;
}
