import { getGovernanceReports, getReportById } from '../services/reportService.js';

export async function getReports(req, res) {
  try {
    const { modelId, reportType, limit = 50 } = req.query;
    const reports = await getGovernanceReports({ modelId, reportType, limit });
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
    const { format = 'markdown' } = req.query;
    const report = await getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${report.reportNumber}.json"`);
      return res.json(report);
    }

    // Default to markdown
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.reportNumber}.md"`);
    res.send(report.reportContent || report.executiveSummary || 'No report content available.');
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
