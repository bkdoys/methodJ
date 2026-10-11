import React from 'react';
import { CourseLink, LinkType } from '../types';
import { getLinkIcon, linkLabel, linkTypeName, resolveLinkType } from '../utils/courseLinks';

interface CourseLinkIconsProps {
  links?: CourseLink[];
  linkTypes: LinkType[];
  className?: string;
  /** Pastilles avec le libellé à côté de l'icône (là où il y a de la place, ex. le minuteur). */
  labels?: boolean;
}

/** Liens d'un cours en petites icônes colorées cliquables (survol = libellé et type). Rien si le cours n'a pas de lien. */
export const CourseLinkIcons: React.FC<CourseLinkIconsProps> = ({ links, linkTypes, className = '', labels = false }) => {
  if (!links || links.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 flex-wrap ${className}`}>
      {links.map((link) => {
        const type = resolveLinkType(linkTypes, link.typeId);
        const Icon = getLinkIcon(type);
        const text = `${linkLabel(link)} · ${linkTypeName(type)}`;
        return (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={text}
            aria-label={text}
            // Les fiches et cartes réagissent au clic : ouvrir un lien ne doit rien déclencher d'autre
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={`inline-flex items-center justify-center rounded-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${
              labels ? 'gap-1.5 h-7 px-2.5 text-xs font-semibold max-w-[14rem]' : 'w-6 h-6'
            }`}
            style={{
              color: type.color,
              backgroundColor: `color-mix(in srgb, ${type.color} 14%, transparent)`,
              outlineColor: type.color,
            }}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {labels && <span className="truncate">{linkLabel(link)}</span>}
          </a>
        );
      })}
    </span>
  );
};
