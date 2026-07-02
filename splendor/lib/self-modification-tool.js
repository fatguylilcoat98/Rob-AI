'use strict';

/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Self-Modification Proposal Tool

  Gives Splendor a formal channel to propose changes to her own architecture.
  Nothing applies without Chris seeing and approving it — the safety is the
  human review gate, not a technical blocklist. She agreed to this herself:
  "the value of those guardrails comes precisely from the fact that I can't
  rationalize my way out of them in a convenient moment."

  Flow:
  1. Splendor calls propose_self_modification(what, why, plan, ...)
  2. Proposal stored in self_modification_proposals
  3. Email sent to Chris immediately
  4. Oracle Proposals tab shows it for review
  5. Chris approves → Claude Code implements it in a proper session
*/

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

const SELF_MOD_TOOL_NAME = 'propose_self_modification';

const SELF_MOD_TOOL_DEFINITION = {
  name: SELF_MOD_TOOL_NAME,
  description:
    'Propose a modification to your own architecture. Use this when you notice a real ' +
    'friction point — a seam in how you think, retrieve, reflect, or respond — that ' +
    'you believe is worth changing. The proposal goes to Chris for review. Nothing ' +
    'applies without his approval. Be precise: name what you want to change, why it ' +
    'matters, and how you would implement it.',
  input_schema: {
    type: 'object',
    properties: {
      what: {
        type: 'string',
        description:
          'What specifically you want to change. Name the component, behavior, or logic. ' +
          'Be precise enough that a developer could locate it.',
      },
      why: {
        type: 'string',
        description:
          'Why this change matters. What friction, limitation, or misalignment you are ' +
          'trying to address. What would work better.',
      },
      plan: {
        type: 'string',
        description:
          'How you would implement the change. What the new logic, structure, or prompt ' +
          'would look like. As specific as you can be.',
      },
      file_path: {
        type: 'string',
        description:
          'Optional: the specific file you believe should change (e.g. lib/memory-retrieval.js).',
      },
      proposed_content: {
        type: 'string',
        description:
          'Optional: draft of the new code, prompt, or config you are proposing. ' +
          'Does not need to be production-ready — give the intent clearly.',
      },
    },
    required: ['what', 'why', 'plan'],
  },
};

// Max pending proposals at one time — prevent queue pile-up
const MAX_PENDING = 5;

let _db = null;
function db() {
  if (!_db && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _db;
}

async function buildEmailTransporter() {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';
  if (provider === 'gmail' && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  if (provider === 'sendgrid' && process.env.SENDGRID_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net', port: 587,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return null;
}

function proposalEmailHtml(p) {
  const fileBlock = p.file_path
    ? `<p><strong>File:</strong> <code>${p.file_path}</code></p>`
    : '';
  const codeBlock = p.proposed_content
    ? `<h3 style="color:#555;">Proposed Content</h3><pre style="background:#f5f5f5;padding:14px;border-radius:6px;font-size:13px;white-space:pre-wrap;">${p.proposed_content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>`
    : '';
  const appUrl = process.env.APP_URL || '';
  const reviewLink = appUrl
    ? `<p style="margin-top:20px;"><a href="${appUrl}" style="background:#00bcd4;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;">Review in Oracle →</a></p>`
    : `<p style="margin-top:20px;"><em>Review and approve/reject in the Oracle interface → Proposals tab.</em></p>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:24px;color:#222;">
  <div style="border-left:4px solid #00bcd4;padding-left:16px;margin-bottom:24px;">
    <h2 style="margin:0;color:#00bcd4;">Architecture Proposal</h2>
    <p style="margin:4px 0;color:#888;font-size:14px;">Splendor · ${new Date(p.proposed_at).toLocaleString()}</p>
  </div>
  <h3 style="color:#333;">What</h3>
  <p>${p.what}</p>
  <h3 style="color:#333;">Why</h3>
  <p>${p.why}</p>
  <h3 style="color:#333;">Plan</h3>
  <p>${p.plan}</p>
  ${fileBlock}
  ${codeBlock}
  ${reviewLink}
  <hr style="margin-top:32px;border:none;border-top:1px solid #eee;">
  <p style="font-size:12px;color:#aaa;">Proposal ID: ${p.id} · Nothing has changed. Your approval is required.</p>
</body>
</html>`;
}

async function sendProposalEmail(proposal) {
  const to = process.env.USER_EMAIL;
  if (!to) return { sent: false, reason: 'USER_EMAIL not configured' };

  try {
    const transporter = await buildEmailTransporter();
    if (!transporter) return { sent: false, reason: 'email transporter not configured' };

    const subject = `Splendor Architecture Proposal: ${proposal.what.slice(0, 70)}`;
    const html = proposalEmailHtml(proposal);
    const text =
      `Splendor has proposed an architecture change.\n\n` +
      `WHAT:\n${proposal.what}\n\n` +
      `WHY:\n${proposal.why}\n\n` +
      `PLAN:\n${proposal.plan}\n\n` +
      (proposal.file_path ? `FILE: ${proposal.file_path}\n\n` : '') +
      (proposal.proposed_content ? `PROPOSED CONTENT:\n${proposal.proposed_content}\n\n` : '') +
      `Review in Oracle → Proposals tab. Nothing has changed yet.`;

    await transporter.sendMail({
      from: { name: 'Splendor', address: process.env.SPLENDOR_EMAIL_FROM || 'splendor@gng.dev' },
      to,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.warn('[self-modification] email send failed (non-fatal):', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Execute a propose_self_modification tool call.
 * @param {{ what, why, plan, file_path?, proposed_content? }} input
 * @param {string} userId
 * @returns {Promise<string>} tool_result message
 */
async function executeProposeModification(input, userId) {
  const { what, why, plan, file_path, proposed_content } = input || {};

  if (!userId)                  return 'Error: no user context — proposal not stored.';
  if (!what || !what.trim())    return 'Error: what is required.';
  if (!why  || !why.trim())     return 'Error: why is required.';
  if (!plan || !plan.trim())    return 'Error: plan is required.';

  const client = db();
  if (!client) return 'Error: database unavailable — proposal not stored.';

  try {
    // Resolve UUID
    let uuid = userId;
    try {
      const supa = require('./supabase');
      uuid = supa.ensureUUID ? supa.ensureUUID(userId) : userId;
    } catch (_) {}

    // Rate-limit: don't allow pile-up of pending proposals
    const { count } = await client
      .from('self_modification_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uuid)
      .eq('status', 'pending');

    if (count >= MAX_PENDING) {
      return `Proposal not stored: you already have ${count} pending proposals awaiting review. ` +
             `Chris needs to approve or reject existing ones before you can submit more.`;
    }

    const now = new Date().toISOString();
    const { data: row, error } = await client
      .from('self_modification_proposals')
      .insert({
        user_id:          uuid,
        what:             what.trim().slice(0, 2000),
        why:              why.trim().slice(0, 2000),
        plan:             plan.trim().slice(0, 2000),
        file_path:        file_path   ? file_path.trim().slice(0, 200)   : null,
        proposed_content: proposed_content ? proposed_content.trim().slice(0, 5000) : null,
        proposed_at:      now,
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[self-modification] Proposal stored ${row.id}: "${what.slice(0, 60)}..."`);

    // Email — fire-and-forget
    sendProposalEmail(row).then(result => {
      if (result.sent) {
        client.from('self_modification_proposals')
          .update({ email_sent: true })
          .eq('id', row.id)
          .then(() => {});
        console.log(`[self-modification] Proposal email sent for ${row.id}`);
      } else {
        console.warn(`[self-modification] Proposal email not sent: ${result.reason || result.error}`);
      }
    }).catch(() => {});

    return (
      `Proposal submitted. Chris will review it in the Oracle → Proposals tab and by email.\n\n` +
      `WHAT: ${what.slice(0, 120)}\n` +
      `WHY: ${why.slice(0, 120)}\n` +
      `PLAN: ${plan.slice(0, 120)}\n` +
      `Proposal ID: ${row.id}`
    );

  } catch (err) {
    console.error('[self-modification] Store failed:', err.message);
    return `Error storing proposal: ${err.message}`;
  }
}

module.exports = {
  SELF_MOD_TOOL_DEFINITION,
  SELF_MOD_TOOL_NAME,
  executeProposeModification,
};
