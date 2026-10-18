import React from 'react';
import { CATCH_UP_HORIZON_DAYS, maxDelayDays } from '../utils/smoothing';
import { MAX_PERIOD_HOURS } from '../utils/revisionPeriod';
import { t } from '../i18n';

/**
 * Règles du lissage de charge, du rattrapage des retards et des périodes de révision, affichées à l'identique dans le
 * tableau de bord, l'assistant de période et l'aide.
 */
export const PlanningRules: React.FC<{ kind: 'smooth' | 'catchup' | 'period' }> = ({ kind }) => (
  <ul className="space-y-1 list-disc pl-4 leading-relaxed">
    {kind === 'period' ? (
      <>
        <li>{t('Les cours choisis en méthode des J passent en révision libre : leurs J à venir sont retirés, les révisions faites restent.')}</li>
        <li>{t('Chaque cours reçoit un nombre de passages selon sa maîtrise (plus il est fragile, plus il revient), modifiable cours par cours.')}</li>
        <li>{t('Les passages d\'un cours sont espacés régulièrement, le dernier près de la fin de la période (de l\'examen).')}</li>
        <li>{t('Les disciplines alternent : les cours d\'une même discipline sont décalés entre eux, jamais toute une discipline le même jour.')}</li>
        <li>{t('À écart égal, le jour le moins chargé est préféré ; l\'objectif quotidien, la plage et les pauses de la période sont respectés.')}</li>
        <li>{t('Si ça ne rentre pas, l\'app propose des journées plus longues (jusqu\'à {h} h), puis une période plus longue.', { h: MAX_PERIOD_HOURS })}</li>
        <li>{t('Rien n\'est modifié avant « Planifier » ; « Autre répartition » tire un autre agencement, et tout s\'annule d\'un clic.')}</li>
        <li>{t('Pendant la période, ses horaires remplacent les vôtres ; après, tout redevient comme avant. Les cours restent en révision libre.')}</li>
      </>
    ) : kind === 'smooth' ? (
      <>
        <li>{t('On repère les jours au-dessus de l\'objectif quotidien ou avec des créneaux hors de la plage de travail.')}</li>
        <li>{t('Si un créneau déborde de la plage alors qu\'une place est libre plus tôt le même jour, il est d\'abord remonté à la première place libre, sans changer de jour.')}</li>
        <li>
          {t('On repousse un créneau non validé de quelques jours, en commençant par les J les plus élevés : {a} jour pour J0 et J1, {b} pour J2 et J3, {c} au-delà.', {
            a: maxDelayDays(1),
            b: maxDelayDays(3),
            c: maxDelayDays(7),
          })}
        </li>
        <li>{t('Une révision R (cours en révision libre) n\'a pas d\'intervalle à respecter : elle est essayée en premier, jusqu\'à {c} jours, et ne décale jamais d\'autres créneaux.', { c: maxDelayDays(7) })}</li>
        <li>{t('Un créneau repoussé est replacé à la première place libre de son nouveau jour : le jour d\'arrivée est jugé avec cette heure, pas avec l\'ancienne.')}</li>
        <li>{t('Un déplacement n\'est proposé que s\'il allège le jour sans en surcharger un autre, cascade des J suivants comprise.')}</li>
        <li>{t('Sinon on le dit : aucune solution simple. Rien n\'est déplacé sans votre accord, et tout s\'annule d\'un clic.')}</li>
        <li>{t('Tout est coché : décochez ce que vous ne voulez pas déplacer. Un déplacement qui comptait sur un autre décoché est grisé et n\'est pas appliqué.')}</li>
        <li>{t('Appliquer ce plan ou celui des retards recalcule l\'autre : les deux se tiennent à jour.')}</li>
      </>
    ) : (
      <>
        <li>{t('Chaque créneau en retard, du plus ancien au plus récent, est replacé le plus tôt possible à partir d\'aujourd\'hui.')}</li>
        <li>{t('Le jour choisi ne doit créer aucun problème : objectif quotidien et plage de travail respectés, cascade comprise.')}</li>
        <li>{t('Le créneau est replacé à la première place libre du jour choisi.')}</li>
        <li>{t('Si la cascade est activée, les J suivants du même cours suivent le mouvement et ne sont pas proposés à part.')}</li>
        <li>{t('Au-delà de {n} jours sans place, on le dit : à décaler à la main. Tout s\'annule d\'un clic.', { n: CATCH_UP_HORIZON_DAYS })}</li>
        <li>{t('Tout est coché : décochez ce que vous ne voulez pas déplacer. Un déplacement qui comptait sur un autre décoché est grisé et n\'est pas appliqué.')}</li>
        <li>{t('Appliquer ce plan ou celui du lissage recalcule l\'autre : les deux se tiennent à jour.')}</li>
      </>
    )}
  </ul>
);
