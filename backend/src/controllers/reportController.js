import { getGovernanceReports, getReportById } from '../services/reportService.js';
import { generateDriftReportPdf } from '../services/pdfService.js';

export async function getReports(req, res) {
  try {
    const { modelId, versionId, batchId, telemetryId, incidentId, reportType, limit = 50 } = req.query;
    const reports = await getGovernanceReports({ modelId, versionId, batchId, telemetryId, incidentId, reportType, limit });
    res.json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getReportDetails(req, res) {
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function exportReport(req, res) {
  try {
    const format = (req.query.format || (req.headers.accept?.includes('application/pdf') ? 'pdf' : (req.headers.accept?.includes('application/json') ? 'json' : 'markdown'))).toLowerCase();
    const report = await getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    const reportNumClean = (report.reportNumber || 'Drift_Report').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'pdf') {
      const pdfBuffer = await generateDriftReportPdf(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${reportNumClean}.pdf"`);
      return res.send(pdfBuffer);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportNumClean}.json"`);
      return res.json(report);
    }

    // Default to markdown
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reportNumClean}.md"`);
    res.send(report.reportContent || report.executiveSummary || 'No report content available.');
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function exportReportPdf(req, res) {
  req.query.format = 'pdf';
  return exportReport(req, res);
}
