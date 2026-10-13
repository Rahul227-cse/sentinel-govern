import { verifyAuditChainIntegrity, simulateTamperOnBlock, repairAuditChain } from '../services/auditEngine.js';
import { AuditLedger } from '../models/AuditLedger.js';
import { compileGovernanceDossier, generateDossierMarkdown } from '../services/reportService.js';

export async function getAuditLedger(req, res) {
  try {
    const { action, entityType, entityId, modelId, versionId, limit = 100 } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;

    if (modelId && versionId) {
      filter.$and = [
        { $or: [{ 'payload.modelId': String(modelId) }, { entityId: String(modelId) }] },
        { $or: [{ 'payload.versionId': String(versionId) }, { entityId: String(versionId) }] }
      ];
    } else if (modelId) {
      filter.$or = [{ 'payload.modelId': String(modelId) }, { entityId: String(modelId) }];
    } else if (versionId) {
      filter.$or = [{ 'payload.versionId': String(versionId) }, { entityId: String(versionId) }];
    }

    const records = await AuditLedger.find(filter)
      .sort({ sequenceNumber: -1 })
      .limit(Number(limit));

    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function checkAuditIntegrity(req, res) {
  try {
    const verification = await verifyAuditChainIntegrity();
    const demoModeEnabled = process.env.NODE_ENV !== 'production' && process.env.ENABLE_AUDIT_TAMPER_DEMO === 'true';
    res.json({
      success: true,
      data: {
        ...verification,
        demoModeEnabled
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function simulateTamper(req, res) {
  try {
    const { sequenceNumber = 0, tamperedPayload } = req.body;
    const block = await simulateTamperOnBlock(
      sequenceNumber,
      tamperedPayload || { tampered: true, maliciousModification: 'Unauthorized parameter overwrite' }
    );
    res.json({
      success: true,
      message: `Simulated tamper injected into block #${sequenceNumber}. Verification will now detect cryptographic discrepancy.`,
      tamperedBlock: block
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function repairAuditLedger(req, res) {
  try {
    const result = await repairAuditChain();
    const verification = await verifyAuditChainIntegrity();
    res.json({
      success: true,
      data: {
        valid: verification.valid,
        totalBlocks: result.count,
        message: `Ledger cryptographic integrity successfully re-sealed across ${result.count} blocks.`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function exportComplianceDossier(req, res) {
  try {
    const { modelId, versionId } = req.params;

    const dossier = await compileGovernanceDossier({
      modelId,
      versionId,
      user: req.user
    });

    if (req.query.format === 'markdown' || req.headers.accept?.includes('text/markdown')) {
      const markdown = generateDossierMarkdown(dossier);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="AI_Governance_Dossier_${(dossier.modelCard?.name || 'Model').replace(/[^a-zA-Z0-9_-]/g, '_')}.md"`
      );
      return res.send(markdown);
    }

    res.json({ success: true, data: dossier });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

