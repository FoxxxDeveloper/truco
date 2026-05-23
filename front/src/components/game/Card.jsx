/**
 * Card component — WebP optimizado con fallback SVG (<picture>).
 */
import { memo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useIsMobileLite } from '../../hooks/useIsMobileLite';
import { useRenderCount } from '../../hooks/useRenderCount';
import {
  getCardBackSvgUrl,
  getCardBackWebpUrl,
  getCardSvgUrl,
  getCardWebpUrl,
} from '../../utils/cardAssets';

function CardPicture({ webpSrc, svgSrc, alt, className, onReady, eager = true }) {
  const handleLoad = useCallback(() => onReady?.(), [onReady]);
  const handleError = useCallback(() => onReady?.(), [onReady]);

  return (
    <picture>
      <source srcSet={webpSrc} type="image/webp" />
      <img
        src={svgSrc}
        alt={alt}
        className={className}
        draggable={false}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
      />
    </picture>
  );
}

function CardInner({ card, faceDown = false, onClick, disabled = false, played = false, small = false }) {
  useRenderCount('Card');
  const mobileLite = useIsMobileLite();
  const [imgReady, setImgReady] = useState(false);
  const onImgLoad = useCallback(() => setImgReady(true), []);

  const backWebp = getCardBackWebpUrl();
  const backSvg = getCardBackSvgUrl();
  const faceWebp = faceDown ? backWebp : getCardWebpUrl(card.suit, card.value);
  const faceSvg = faceDown ? backSvg : getCardSvgUrl(card.suit, card.value);

  const loadingClass = !imgReady && !faceDown ? 'card-img-loading' : 'card-img-ready';
  const cardClass = `card playing-card${faceDown ? '' : ' card-face'}${played ? ' card-played' : ''}${small ? ' card-small' : ''}${!faceDown ? ` ${loadingClass}` : ''}`;

  const imgBlock = faceDown ? (
    <CardPicture
      webpSrc={backWebp}
      svgSrc={backSvg}
      alt="Carta boca abajo"
      className="card-img"
      onReady={onImgLoad}
    />
  ) : (
    <>
      {!imgReady && (
        <span className="card-img-placeholder-wrap" aria-hidden>
          <CardPicture
            webpSrc={backWebp}
            svgSrc={backSvg}
            alt=""
            className="card-img card-img-placeholder"
          />
        </span>
      )}
      <CardPicture
        webpSrc={faceWebp}
        svgSrc={faceSvg}
        alt={`${card.value} de ${card.suit}`}
        className="card-img"
        onReady={onImgLoad}
      />
    </>
  );

  if (mobileLite) {
    if (faceDown) {
      return <div className={cardClass}>{imgBlock}</div>;
    }
    if (played || disabled) {
      return (
        <div className={cardClass} aria-label={`${card.value} de ${card.suit}`}>
          {imgBlock}
        </div>
      );
    }
    return (
      <button
        type="button"
        className={cardClass}
        onClick={onClick}
        disabled={disabled}
        aria-label={`${card.value} de ${card.suit}`}
      >
        {imgBlock}
      </button>
    );
  }

  const motionProps = {
    initial: faceDown ? { scale: 0, rotateY: 180 } : { scale: 0, y: 40 },
    animate: faceDown ? { scale: 1, rotateY: 0 } : { scale: 1, y: 0 },
    transition: { type: 'spring', stiffness: faceDown ? 200 : 300, damping: faceDown ? 20 : 25 },
    whileHover: !disabled && !faceDown && !played ? { y: -10, scale: 1.04 } : {},
    whileTap: !disabled && !faceDown ? { scale: 0.95 } : {},
  };

  if (faceDown) {
    return (
      <motion.div className={cardClass} {...motionProps}>
        {imgBlock}
      </motion.div>
    );
  }

  const Wrapper = played || disabled ? motion.div : motion.button;

  return (
    <Wrapper
      className={cardClass}
      onClick={!disabled && !played ? onClick : undefined}
      disabled={played || disabled ? undefined : disabled}
      type={played || disabled ? undefined : 'button'}
      aria-label={`${card.value} de ${card.suit}`}
      {...motionProps}
    >
      {imgBlock}
    </Wrapper>
  );
}

const Card = memo(CardInner);
export default Card;
