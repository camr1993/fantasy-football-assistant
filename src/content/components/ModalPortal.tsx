import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const PORTAL_CONTAINER_ID = 'fantasy-assistant-modal-root';

/**
 * Render a modal into document.body rather than where its trigger sits.
 *
 * The recommendation icons are injected inside Yahoo's roster table, so a
 * modal rendered in place is nested deep in their markup. `position: fixed`
 * is resolved against the nearest ancestor with a transform, filter,
 * perspective, will-change or contain - any of which Yahoo may set on a table
 * or row - rather than against the viewport. When that happened the overlay
 * covered only part of the page and the modal was sized and centred against
 * that element, so its content appeared to spill off the side of the screen.
 *
 * Portalling to body puts the overlay back in the viewport's coordinate
 * space, which no amount of box-sizing or wrapping on our side could fix.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  if (!elementRef.current) {
    elementRef.current = document.createElement('div');
    elementRef.current.id = PORTAL_CONTAINER_ID;
  }

  useEffect(() => {
    const element = elementRef.current!;
    document.body.appendChild(element);
    return () => {
      element.remove();
    };
  }, []);

  return ReactDOM.createPortal(children, elementRef.current);
}
