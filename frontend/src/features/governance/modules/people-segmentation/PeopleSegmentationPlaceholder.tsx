import { SectionCard, StateRegion } from "../../../../shared/ui";
import { Link } from "react-router";
import { appRoutes } from "../../../../navigation/routes";

/**
 * Placeholder component for People Segmentation workspace (Issue #139).
 * 
 * This module is planned but not yet implemented. It depends on:
 * - Privacy/grammar ADR definition
 * - People segmentation grammar specification
 * - Backend API endpoints for segmentation rules
 * 
 * @see https://github.com/didaxus/civitas10/issues/139
 */
export const PeopleSegmentationPlaceholder = () => {
  return (
    <SectionCard 
      title="Segmentación de personas" 
      description="Configura reglas de segmentación basadas en atributos de usuarios y contexto organizacional."
    >
      <StateRegion>
        <div className="flex flex-col gap-4 py-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-strong">Funcionalidad próximamente disponible</h3>
            <p className="text-sm text-muted-strong">
              Este módulo permitirá definir segmentos de personas usando una gramática de reglas basada en:
            </p>
            <ul className="list-disc list-inside text-sm text-muted space-y-1 ml-2">
              <li>Atributos demográficos y de perfil</li>
              <li>Pertenencia a unidades organizacionales</li>
              <li>Rol y permisos asignados</li>
              <li>Historial de actividad y engagement</li>
              <li>Criterios personalizados configurables</li>
            </ul>
          </div>
          
          <div className="pt-4 border-t border-border-subtle">
            <p className="text-xs text-muted mb-3">
              La especificación técnica está pendiente de definición en el ADR de privacidad y gramática de segmentación.
            </p>
            <Link 
              to={appRoutes.ownerOrganizationGovernanceStructure.path}
              className="civitas-secondary-button inline-flex items-center gap-2"
            >
              Mientras tanto, explora la estructura organizacional
            </Link>
          </div>
        </div>
      </StateRegion>
    </SectionCard>
  );
};
