import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const files = {
  canonical: '00-CIVITAS-ORGANIZATION-ONBOARDING-AND-ACTIVATION-v1.2.1.md',
  backend: 'CIVITAS_ARCHITECTURE_REVIEW_ONBOARDING_BACKEND-v1.2.1.docx',
  ui: 'CIVITAS_ARCHITECTURE_REVIEW_ONBOARDING_UI-v1.2.1.docx',
  consistency: 'CIVITAS_ONBOARDING_CONSISTENCY_CHECK-v1.2.1.md',
  repository: 'CIVITAS_ONBOARDING_REPOSITORY_COMPLIANCE-v1.2.1.md',
  reconciliation: 'CIVITAS_ONBOARDING_AUDIT_RECONCILIATION-v1.2.1.md',
  uxAudit: 'CIVITAS_ONBOARDING_UX_NAVIGATION_AUDIT-v1.2.0.md',
};
const errors=[]; const checks=[];
function check(id, condition, detail){checks.push({id,passed:Boolean(condition),detail}); if(!condition) errors.push(`${id}: ${detail}`);}
function read(name){const p=path.join(ROOT,name); check(`file:${name}`,fs.existsSync(p),'required file must exist'); return fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';}
function docxText(name){const p=path.join(ROOT,name); if(!fs.existsSync(p)) return ''; const xml=childProcess.execFileSync('unzip',['-p',p,'word/document.xml'],{encoding:'utf8'}); return xml.replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"');}
function all(text,values){return values.every(v=>text.includes(v));}
function sha(name){return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,name))).digest('hex');}

const canonical=read(files.canonical), backend=docxText(files.backend), ui=docxText(files.ui), consistency=read(files.consistency), repository=read(files.repository), reconciliation=read(files.reconciliation), audit=read(files.uxAudit);
check('version',canonical.includes('**Versión:** `1.2.1`'),'canonical version');
check('repo',canonical.includes('`didaxus/civitas10`'),'target repository');
check('bootstrap',all(canonical,['runCanonicalOrganizationProvisioning()','OrganizationBootstrapRunner']),'bootstrap preserved');
check('tenant-resolution',all(canonical,['tenantSlug','OrganizationHostname','{tenantSlug}.portal.didaxus.com']),'Tenant Resolution');
check('routes:owner',all(canonical,['/owner/organization-onboardings/{onboardingId}/{visibleStepKey}/{sectionKey}','findings/{findingId}']),'owner hierarchical routes');
check('routes:tenant',all(canonical,['/onboarding/{visibleStepKey}/{sectionKey}','/settings']),'tenant hierarchical routes');
check('breadcrumbs',all(canonical,['Organizaciones','Configuración de la organización','aria-current="page"']),'surface breadcrumbs');
check('registry',all(canonical,['defaultSectionKey','findingRouteTemplate','resumeRouteTemplate','exitRouteTemplate','breadcrumbSegments']),'hierarchical registry');
check('sections',all(canonical,['OnboardingSectionNavigator','attribute_mappings','owner_ceilings','activation_plan']),'internal section navigation');
check('applicability',all(canonical,['Paso 3 de 6 aplicables · 2 no aplican','not_applicable','no bloquea readiness']),'applicability contract');
check('step-behavior',all(canonical,['Editar etapa','invalida sus validation runs','plan obsoleto']),'step behavior and invalidation');
check('action-matrix',all(canonical,['OnboardingAction','request_plan_regeneration','Administrador de la organización']),'action matrix');
check('blocker-cta',all(canonical,['OnboardingFindingResolution','Solicitar intervención','nunca navega a una acción forbidden']),'role-aware blocker');
check('save-semantics',all(canonical,['Autosave','Guardar borrador','Guardar y salir','Continuar']),'save semantics');
check('language',all(canonical,['Idioma visible predeterminado','Administrador Didaxus','Guardado hace 2 minutos']),'language policy');
check('receipt',all(canonical,['Abrir vista general de la organización','Ir al inicio de la organización']),'receipt priority');
check('backend',all(backend,['Contrato backend de navegación v1.2.1','GET /api/onboarding/navigation','responsibleActor','stale']),'backend navigation contract');
check('ui',all(ui,['Contrato de navegación reconciliado v1.2.1','Breadcrumbs por superficie','Paso 3 de 6 aplicables','Guardar y salir','Administrador Didaxus']),'UI navigation contract');
check('consistency',all(consistency,['PASS_DOCUMENT_CONSISTENCY_WITH_NAVIGATION_PATCHES','Bloqueadores UX P0 pendientes:           0','Hallazgos UX P1 pendientes:              0']),'consistency status');
check('repository',all(repository,['**Estado inicial:** `NOT_IMPLEMENTED`','sectionKey','findingRoute','blocker CTA']),'repository gate updated');
check('reconciliation',all(reconciliation,['P0 reconciliados','P1 reconciliados','Producción:                       NO_GO']),'audit reconciliation');
check('audit-source',all(audit,['P0-1. El breadcrumb','P0-8. La matriz de permisos','Ajustes P0 antes de implementar UI-0']),'audit source intact');

const manifest={status:errors.length?'FAIL':'PASS_DOCUMENT_CONSISTENCY_WITH_NAVIGATION_PATCHES',canonicalVersion:'1.2.1',repository:'didaxus/civitas10',repositoryStatus:'NOT_IMPLEMENTED',tenantResolutionCompatibility:'PASS_CONTRACT',uxNavigationAudit:'RECONCILED',executedAt:new Date().toISOString(),documents:Object.values(files).map(name=>({name,bytes:fs.statSync(path.join(ROOT,name)).size,sha256:sha(name)})),routes:{ownerIndex:'/owner/organization-onboardings',ownerStep:'/owner/organization-onboardings/:onboardingId/:visibleStepKey',ownerSection:'/owner/organization-onboardings/:onboardingId/:visibleStepKey/:sectionKey',tenantSummary:'/onboarding',tenantSection:'/onboarding/:visibleStepKey/:sectionKey'},visibleSteps:['organization_portal','initial_administrators','access_methods','provisioning_lifecycle','identity_structure_mapping','authorization_simulation','dry_run_review','approval_publication'],navigationControls:['surface-breadcrumbs','parent-resume-exit','hierarchical-registry','section-navigation','applicable-step-count','step-open-behavior','actor-action-matrix','role-aware-blocker','save-semantics','spanish-copy','actor-aware-receipt'],semanticChecks:checks,errors};
fs.writeFileSync(path.join(ROOT,'onboarding-contract-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
if(errors.length){console.error('[onboarding-contract] FAIL'); for(const e of errors) console.error(`- ${e}`); process.exit(1);}
console.log('[onboarding-contract] PASS_DOCUMENT_CONSISTENCY_WITH_NAVIGATION_PATCHES');
console.log(`- semantic checks: ${checks.length}`);
console.log('- UX P0 pending: 0');
console.log('- UX P1 pending: 0');
console.log('- repository status: NOT_IMPLEMENTED');
