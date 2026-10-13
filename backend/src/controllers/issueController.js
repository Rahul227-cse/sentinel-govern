import * as issueService from '../services/issueService.js';

export async function createIssueReport(req, res) {
  try {
    // Identity verification: reject attempts to spoof reporter identity
    if (req.body.submitterUserId && String(req.body.submitterUserId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: 'Cannot forge submitter identity. Issue report must belong to the authenticated user.'
      });
    }

    if (req.body.reporterId && String(req.body.reporterId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: 'Cannot forge submitter identity. Issue report must belong to the authenticated user.'
      });
    }

    const {
      modelId,
      versionId,
      issueType,
      severity,
      title,
      description,
      evidence
    } = req.body;

    const issue = await issueService.createIssueReport({
      modelId,
      versionId,
      issueType,
      severity,
      title,
      description,
      evidence,
      user: req.user
    });

    res.status(201).json({ success: true, data: issue });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function getIssueReports(req, res) {
  try {
    const issues = await issueService.getIssueReports({
      user: req.user,
      query: req.query
    });

    res.json({ success: true, count: issues.length, data: issues });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getIssueReportById(req, res) {
  try {
    const issue = await issueService.getIssueReportById({
      issueId: req.params.id,
      user: req.user
    });

    if (!issue) {
      return res.status(404).json({ success: false, error: 'Issue report not found' });
    }

    res.json({ success: true, data: issue });
  } catch (error) {
    const statusCode = error.statusCode || (error.message.includes('Invalid') ? 400 : 500);
    res.status(statusCode).json({ success: false, error: error.message });
  }
}

export async function updateIssueReport(req, res) {
  try {
    const { status, resolutionNotes } = req.body;

    const issue = await issueService.updateIssueReport({
      issueId: req.params.id,
      status,
      resolutionNotes,
      user: req.user
    });

    if (!issue) {
      return res.status(404).json({ success: false, error: 'Issue report not found' });
    }

    res.json({ success: true, data: issue });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function escalateIssueToIncident(req, res) {
  try {
    const { title, description, recommendedAction, targetVersionId } = req.body;

    const result = await issueService.escalateIssueToIncident({
      issueId: req.params.id,
      user: req.user,
      title,
      description,
      recommendedAction,
      targetVersionId
    });

    if (!result) {
      return res.status(404).json({ success: false, error: 'Issue report not found' });
    }

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}
