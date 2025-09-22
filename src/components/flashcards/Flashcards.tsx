import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './Flashcards.module.css';

// Optional: accept props if you already have external data
interface Card {
  front: string;
  back: string;
}
interface FlashcardsProps {
  cards?: Card[];
}

export default function Flashcards({ cards }: FlashcardsProps) {
  // You can replace this with actual data or fetch from a file
  // Fallback data if no cards prop is provided  
  console.log('Flashcards cards:', cards);
  const data: Card[] = cards && cards.length
    ? cards
    : [
        { front: "Flashcard 1: How is the name 'markhor' pronounced?", back: "MAR-kor." },
        { front: "Flashcard 2: How is the name 'oryx' pronounced?", back: "OR-iks." },
      ];

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const clickTimeoutRef = useRef<number | null>(null);
  const hadSelectionAtMouseDownRef = useRef(false);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);  

  const hasActiveSelection = () => {
    const sel = window.getSelection();
    if (!sel) return false;
    if (sel.isCollapsed) return false;
    return sel.toString().trim().length > 0;
  };

    // Immediate flip helper
  const flipNow = () => setFlipped(f => !f);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && !hasActiveSelection()) {
      e.preventDefault();
      flipNow();
    }
  };

  const handleMouseDown = () => {
    // Snapshot whether a selection existed BEFORE this click clears it
    hadSelectionAtMouseDownRef.current = hasActiveSelection();
  };  

 const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If there WAS a selection at mousedown, skip flipping (even though click cleared it)
    if (hadSelectionAtMouseDownRef.current) {
      hadSelectionAtMouseDownRef.current = false;
      // Cancel any pending flip timeout
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    // Double click (detail > 1) => cancel pending single-click flip
    if (e.detail > 1) {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      return;
    }

    // Schedule delayed flip to allow time for a possible second click (double-click)
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      clickTimeoutRef.current = null;
      // Re-check (user might have dragged to select)
      if (hasActiveSelection()) return;
      flipNow();
    }, 180);
  };  

  const next = useCallback(() => {
    setFlipped(false);
    setIndex(i => (i + 1) % data.length);
  }, [data.length]);

  const prev = useCallback(() => {
    setFlipped(false);
    setIndex(i => (i - 1 + data.length) % data.length);
  }, [data.length]);

  const card = data[index];

  return (
    <div className={styles.root}>
      <div
        className={`${styles.flashcard} ${flipped ? styles.flipped : ''}`}
        onMouseDown={handleMouseDown}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Flashcard"
      >
        <div className={styles.front}>{card.front}</div>
        <div className={styles.back}>{card.back}</div>
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.navButton} onClick={prev} aria-label="Previous">
          ‹
        </button>
        <span className={styles.counter}>
          {index + 1}/{data.length}
        </span>
        <button type="button" className={styles.navButton} onClick={next} aria-label="Next">
          ›
        </button>
      </div>
    </div>
  );
}