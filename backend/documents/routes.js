const { DocumentContractError } = require("./contracts");

const principal = (req) => ({ subject: req.auth?.subject || req.user?.sub, organizationId: req.params.organizationId, scopes: req.auth?.scopes || req.user?.scopes || [] });
const handle = (res, error) => {
  if (!(error instanceof DocumentContractError)) throw error;
  const status = error.code.endsWith("forbidden") ? 403 : error.code.endsWith("not_found") ? 404 : error.code.endsWith("terminal") ? 409 : 400;
  return res.status(status).json({ code: error.code, message: error.message });
};

function createDocumentHandlers({ service, producer }) {
  return {
    request: async (req, res) => { try { const operation = await service.requestGeneration({ ...req.body, organizationId: req.params.organizationId, idempotencyKey: req.get("Idempotency-Key"), principal: principal(req) }); if (!operation.duplicate) await producer.enqueue({ id: operation.operationId, organizationId: req.params.organizationId }); const location = `/o/${encodeURIComponent(req.params.organizationId)}/document-operations/${operation.operationId}`; return res.status(202).location(location).json(operation); } catch (e) { return handle(res,e); } },
    operation: async (req,res) => { try { return res.json(await service.getOperation({ organizationId:req.params.organizationId, operationId:req.params.operationId, principal:principal(req) })); } catch(e) { return handle(res,e); } },
    cancel: async (req,res) => { try { return res.json(await service.cancel({ organizationId:req.params.organizationId, operationId:req.params.operationId, principal:principal(req) })); } catch(e) { return handle(res,e); } },
    download: async (req,res) => { try { return res.json(await service.authorizeDownload({ organizationId:req.params.organizationId, documentId:req.params.documentId, principal:principal(req) })); } catch(e) { return handle(res,e); } },
  };
}
module.exports = { createDocumentHandlers };
