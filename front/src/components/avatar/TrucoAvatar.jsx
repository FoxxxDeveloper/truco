/**
 * Avatar TrucoFX — personaje Avataaars (DiceBear local). Sin fotos ni URLs nuevas.
 */
import { useId, useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as avataaarsStyle from '@dicebear/avataaars';
import { configToDicebearOptions, resolveAvataaarsConfig } from '../../utils/avatar';

/**
 * Cada SVG de Avataaars trae ids fijos (viewboxMask, etc.). Con varios avatares en el DOM
 * las máscaras se cruzan y el círculo de fondo puede pintarse a escala incorrecta (óvalo gigante).
 */
function uniquifyAvataaarsSvgIds(svgString, reactId) {
  if (!svgString) return svgString;
  const prefix = `av${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const found = [...svgString.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const uniqueIds = [...new Set(found)].sort((a, b) => b.length - a.length);
  let out = svgString;
  for (const id of uniqueIds) {
    const nid = `${prefix}_${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`id="${esc}"`, 'g'), `id="${nid}"`);
    out = out.replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${nid})`);
    out = out.replace(new RegExp(`url\\('#${esc}'\\)`, 'g'), `url('#${nid}')`);
    out = out.replace(new RegExp(`url\\("#${esc}"\\)`, 'g'), `url("#${nid}")`);
    out = out.replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${nid}"`);
    out = out.replace(new RegExp(`xlink:href="#${esc}"`, 'g'), `xlink:href="#${nid}"`);
  }
  return out;
}

export default function TrucoAvatar({ avatar, username, size = 40, className = '' }) {
  const config = useMemo(() => resolveAvataaarsConfig(avatar, username), [avatar, username]);
  const svgIdKey = useId();

  const svg = useMemo(() => {
    try {
      const opts = { ...configToDicebearOptions(config, username), size };
      const raw = createAvatar(avataaarsStyle, opts).toString();
      return uniquifyAvataaarsSvgIds(raw, svgIdKey);
    } catch {
      return null;
    }
  }, [config, size, username, svgIdKey]);

  if (!svg) {
    return (
      <span
        className={`truco-avatar-root truco-avatar-root--fallback ${className}`.trim()}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #004B23, #06351f)',
          display: 'inline-flex',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className={`truco-avatar-root truco-avatar-root--avataaars ${className}`.trim()}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '50%',
        flexShrink: 0,
        lineHeight: 0,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
