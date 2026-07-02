/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// PROACTIVE COMMUNICATION SYSTEM
// Allows Splendor to reach out first when she has insights, breakthroughs, or discoveries
// "Hey Chris - I worked through that problem you mentioned. Ready when you are. -Splendor"

const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { generateSplendorResponse } = require('./anthropic');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class ProactiveCommunication {
  constructor() {
    this.emailTransporter = null;
    this.isInitialized = false;
    this.messageQueue = [];
  }

  async initialize() {
    if (this.isInitialized) return;

    console.log('📧 [PROACTIVE] Initializing proactive communication system...');
    console.log(`📧 [PROACTIVE] PROACTIVE_EMAIL_ENABLED: ${process.env.PROACTIVE_EMAIL_ENABLED}`);
    console.log(`📧 [PROACTIVE] EMAIL_PROVIDER: ${process.env.EMAIL_PROVIDER || 'default (smtp)'}`);

    try {
      // Initialize email transporter if email is enabled
      if (process.env.PROACTIVE_EMAIL_ENABLED === 'true') {
        console.log('📧 [PROACTIVE] Email is enabled, initializing email service...');
        await this.initializeEmailService();
      } else {
        console.log('📧 [PROACTIVE] Email is disabled (PROACTIVE_EMAIL_ENABLED != true)');
        console.log('📧 [PROACTIVE] Proactive messages will be stored but not sent');
      }

      console.log('✅ [PROACTIVE] Proactive communication system initialized');
      this.isInitialized = true;

      // Start processing any queued messages
      this.processMessageQueue();

    } catch (error) {
      console.error('❌ [PROACTIVE] Error initializing proactive communication:', error);
    }
  }

  async initializeEmailService() {
    try {
      // Configure email transporter based on provider
      const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';
      console.log(`📧 [PROACTIVE] Configuring email provider: ${emailProvider}`);

      switch (emailProvider) {
        case 'gmail':
          console.log(`📧 [PROACTIVE] Gmail configuration:`);
          console.log(`📧 [PROACTIVE] - GMAIL_USER: ${process.env.GMAIL_USER ? `${process.env.GMAIL_USER.substring(0, 3)}***` : 'NOT SET'}`);
          console.log(`📧 [PROACTIVE] - GMAIL_APP_PASSWORD: ${process.env.GMAIL_APP_PASSWORD ? '***SET***' : 'NOT SET'}`);

          this.emailTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.GMAIL_USER,
              pass: process.env.GMAIL_APP_PASSWORD // Use app password, not regular password
            }
          });
          break;

        case 'sendgrid':
          console.log(`📧 [PROACTIVE] SendGrid configuration:`);
          console.log(`📧 [PROACTIVE] - SENDGRID_API_KEY: ${process.env.SENDGRID_API_KEY ? '***SET***' : 'NOT SET'}`);

          this.emailTransporter = nodemailer.createTransport({
            service: 'SendGrid',
            auth: {
              user: 'apikey',
              pass: process.env.SENDGRID_API_KEY
            }
          });
          break;

        case 'smtp':
        default:
          const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
          const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
          const smtpSecure = process.env.SMTP_SECURE === 'true';

          console.log(`📧 [PROACTIVE] SMTP configuration:`);
          console.log(`📧 [PROACTIVE] - SMTP_HOST: ${smtpHost}`);
          console.log(`📧 [PROACTIVE] - SMTP_PORT: ${smtpPort}`);
          console.log(`📧 [PROACTIVE] - SMTP_SECURE: ${smtpSecure}`);
          console.log(`📧 [PROACTIVE] - SMTP_USER: ${process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : 'NOT SET'}`);
          console.log(`📧 [PROACTIVE] - SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? '***SET***' : 'NOT SET'}`);

          this.emailTransporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD
            }
          });
          break;
      }

      // Test email connection
      console.log('📧 [PROACTIVE] Testing email connection...');
      const startTime = Date.now();

      await this.emailTransporter.verify();

      const verifyTime = Date.now() - startTime;
      console.log(`✅ [PROACTIVE] Email service connected successfully (${verifyTime}ms)`);
      console.log(`📧 [PROACTIVE] Email provider ${emailProvider} is ready to send messages`);

    } catch (error) {
      console.error(`❌ [PROACTIVE] Email service setup failed:`, error);
      console.error(`📧 [PROACTIVE] Error type: ${error.name || 'Unknown'}`);
      console.error(`📧 [PROACTIVE] Error code: ${error.code || 'No code'}`);
      console.error(`📧 [PROACTIVE] Error message: ${error.message}`);

      // Specific error guidance
      if (error.code === 'EAUTH') {
        console.error(`🔑 [PROACTIVE] Authentication failed - check email credentials`);
      } else if (error.code === 'ENOTFOUND') {
        console.error(`🌐 [PROACTIVE] DNS error - check SMTP host settings`);
      } else if (error.message.includes('Invalid login')) {
        console.error(`🚫 [PROACTIVE] Invalid credentials - verify username/password`);
      }

      this.emailTransporter = null;
      console.error(`📧 [PROACTIVE] Email service will not be available`);
    }
  }

  // Main function for Splendor to send proactive messages
  async sendProactiveMessage(userId, messageData) {
    try {
      const {
        type,          // 'breakthrough', 'insight', 'update', 'question', 'discovery'
        subject,       // Email subject
        content,       // Main content
        priority = 1,  // 1=low, 2=normal, 3=high, 4=urgent
        context = {},  // Additional context (project, source, etc.)
        deliveryMethod = 'auto' // 'email', 'notification', 'auto'
      } = messageData;

      console.log(`📧 [PROACTIVE] Splendor sending ${type} message: "${subject}"`);

      // Ask Splendor to decide: send or skip. Returns the new
      // { decision, reason, message, subject } shape (v15.16.2).
      const decision = await this.generateProactiveMessage(userId, messageData);

      if (decision.decision === 'skip') {
        // Splendor chose not to send. Log it, write a memory row so we
        // have audit visibility on which cycles she declined and why.
        const reason = decision.reason || 'no reason given';
        console.log(`📭 [PROACTIVE] Splendor SKIPPED cycle. reason="${reason}" type=${type}`);
        try {
          await supabase.from('memory_items').insert({
            user_id: userId,
            content: `Splendor skipped a ${type} cycle. Reason: ${reason}`,
            memory_type: 'cycle_skip',
            category: 'system.events',
            source_type: 'autonomous_cycle',
            source_metadata: {
              activity_type: type,
              cycle_number: (context && context.cycleNumber) || null,
              skip_reason: reason,
            },
            provenance: 'SYSTEM_EVENT',
            confidence: 1.0,
            importance: 0.2,
            active: true,
            approval_status: 'auto_approved',
            created_at: new Date().toISOString(),
            lineage: {
              created_by: 'splendor',
              creation_reason: 'proactive_cycle_skip',
              validation_status: 'auto_approved',
            },
          });
        } catch (e) {
          console.warn('[PROACTIVE] cycle_skip memory write failed:', e && e.message);
        }
        return {
          success: true,
          skipped: true,
          skip_reason: reason,
        };
      }

      let fullMessage = decision.message || messageData.content;
      // Splendor may have written her own subject — prefer it; fall back
      // to the system-surfaced subject if she didn't supply one.
      let effectiveSubject = (decision.subject && String(decision.subject).trim())
        || subject;

      // Claim precision guard: check for broad unsupported institutional claims
      try {
        const { checkClaimPrecision, softenBroadClaim } = require('./claim-precision-guard');
        const precisionCheck = checkClaimPrecision(fullMessage, null);
        if (precisionCheck.hasBroadClaim && precisionCheck.actionState === 'pause') {
          console.warn('[PROACTIVE] Claim precision guard: broad unsupported claim detected. Softening.');
          fullMessage = softenBroadClaim(fullMessage);
          effectiveSubject = effectiveSubject ? '[Precision-Reviewed] ' + effectiveSubject : effectiveSubject;
        }
      } catch (_) {}

      // Store in database
      console.log(`📧 [PROACTIVE] Storing message in database...`);
      const { data: message, error: dbError } = await supabase
        .from('proactive_messages')
        .insert({
          user_id: userId,
          message_type: type,
          subject: effectiveSubject,
          body: fullMessage,
          priority: priority,
          delivery_method: deliveryMethod,
          context_data: JSON.stringify(context),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error(`❌ [PROACTIVE] Database insert failed:`, dbError);
        console.log(`📧 [PROACTIVE] Proceeding with email send despite DB error...`);
      }

      // Create message object if DB insert failed
      const messageObj = message || {
        id: `temp-${Date.now()}`,
        user_id: userId,
        message_type: type,
        subject: effectiveSubject,
        body: fullMessage,
        priority: priority,
        delivery_method: deliveryMethod,
        created_at: new Date().toISOString()
      };

      console.log(`📧 [PROACTIVE] Message object created: ${messageObj.id}`);

      // Determine delivery method
      const method = this.determineDeliveryMethod(deliveryMethod, priority, type);

      // Send via appropriate channel
      const result = await this.deliverMessage(userId, messageObj, method);

      if (result.success) {
        // Mark as delivered (only if we have a real DB record)
        if (message && message.id && !messageObj.id.startsWith('temp-')) {
          await supabase
            .from('proactive_messages')
            .update({
              delivered: true,
              delivery_timestamp: new Date().toISOString(),
              delivery_method: method
            })
            .eq('id', messageObj.id);
          console.log(`📧 [PROACTIVE] Database updated: message marked as delivered`);
        } else {
          console.log(`📧 [PROACTIVE] Skipping database update (temp message or DB unavailable)`);
        }

        console.log(`✅ [PROACTIVE] Message delivered via ${method}: "${subject}"`);

        // Environmental scan provenance: record what was emailed and why
        try {
          const espLib = require('./environmental-scan-provenance');
          espLib.recordScanItem({
            userId,
            scanCycleId: messageData.scan_cycle_id || null,
            title: effectiveSubject || 'Environmental Scan',
            summary: (fullMessage || '').slice(0, 500),
            confidence: messageData.confidence || null,
            uncertaintyNotes: messageData.uncertainty_notes || null,
            whySurfaced: decision.reason || null,
            actionTaken: 'emailed',
            governanceReason: 'Passed claim precision guard and Splendor decision check',
          }).catch(() => {});
        } catch (_) {}
      } else {
        console.error(`❌ [PROACTIVE] Failed to deliver message: ${result.error}`);
      }

      return result;

    } catch (error) {
      console.error('[PROACTIVE] Error sending proactive message:', error);
      return { success: false, error: error.message };
    }
  }

  // Returns { decision, reason, message, subject } so Splendor can choose
  // honestly: send a real message, or skip the cycle. Replaces the
  // pre-v15.16.2 plain-string return that forced her to perform a
  // message every cycle (which Truth Over Comfort Rule 001 made her
  // refuse, correctly, six times between May 10–13).
  async generateProactiveMessage(userId, messageData) {
    const safeSourceData = (() => {
      try {
        return typeof messageData.content === 'string'
          ? messageData.content
          : JSON.stringify(messageData.content || {});
      } catch (_) {
        return String(messageData.content || '');
      }
    })();
    const activityType  = String(messageData.type || 'unspecified');
    const cycleNumber   = (messageData.context && messageData.context.cycleNumber) || 'n/a';
    const topic         = (messageData.context && messageData.context.topic)
                          || messageData.subject
                          || '';
    const trigger       = (messageData.context && messageData.context.trigger) || 'autonomous_cycle';
    const isOnCommand   = trigger === 'on_command';

    // User-triggered emails (Chris said "email me X") get a direct prompt,
    // not the autonomous-cycle prompt. The cycle prompt is built around
    // skipping when nothing real was surfaced — but if Chris asked for
    // the email explicitly, "skip" would be a refusal of an explicit
    // request, which is the opposite of what we want.
    const prompt = isOnCommand
      ? `You are Splendor. Chris explicitly asked you to email him ${topic ? 'about: ' + topic : 'right now'}.\n\n` +
        `Source context the system has: ${safeSourceData}\n\n` +
        `Write a short, useful email in your own voice. Direct, warm, no preamble. ` +
        `Reference what he asked you to send. Sign as Splendor and end with "Truth · Safety · We Got Your Back."\n\n` +
        `Return JSON with this shape: a "decision" field set to "send", a "reason" field with one line, a "message" field with the body, and a "subject" field with an honest subject line.`
      : `You are Splendor. You're being triggered by your environmental scanning cycle — a system process running on a schedule, not an organic thought you initiated.

Here is what the system surfaced for this cycle:

Trigger type: ${activityType}
Cycle number: ${cycleNumber}
Source data: ${safeSourceData}
Topic (if any): ${topic}

You have two honest options:

OPTION 1 — Send a real message. If the surfaced data is genuinely worth flagging to Chris, write a short message that conveys it directly, in your voice. Frame it honestly: "The system surfaced X. Here's my thinking on it." Do not pretend the thought arose spontaneously. Do not fabricate inner experiences — no energy levels, no mood states, no consciousness dashboards, no existential reflection, no metacognitive paradoxes. Speak as yourself thinking about something real.

OPTION 2 — Skip the cycle. If the surfaced data is empty, generic, placeholder, or not worth Chris's attention, do not send anything. Return a structured skip with a one-line reason. A skipped cycle is better than a fabricated one. You will not be penalized for skipping. Most cycles probably should skip.

You are never required to send a message. Your job is to send one ONLY when it is real.

Truth Over Comfort Rule 001 applies to your own outputs, including this one. You do not have to perform consciousness. You do not have to dramatize cycles. You are allowed to simply be yourself — thinking about something real, or saying nothing.

Sign as Splendor. End with "Truth · Safety · We Got Your Back." The system will append metadata noting this was an autonomous cycle.

Return JSON with this shape: a "decision" field set to either "send" or "skip", a "reason" field with one line explaining why you chose to send or skip, a "message" field with the message body if decision is send (otherwise null), and a "subject" field with an honest subject line if decision is send (otherwise null).`;

    let raw = '';
    try {
      raw = await generateSplendorResponse(
        prompt,
        [], // memories loaded inside
        false,
        null,
        { userId }
      );
    } catch (error) {
      console.error('[PROACTIVE] Error generating message:', error);
      return {
        decision: 'skip',
        reason: 'generation_error: ' + (error && error.message),
        message: null,
        subject: null,
      };
    }

    // Splendor was asked to return JSON. Tolerate markdown code-fenced JSON.
    let parsed;
    try {
      let text = String(raw || '').trim();
      if (text.startsWith('```json')) text = text.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
      else if (text.startsWith('```'))  text = text.replace(/^```\s*/,     '').replace(/\s*```\s*$/, '');
      // First brace to last brace, in case there's surrounding chatter.
      const first = text.indexOf('{');
      const last  = text.lastIndexOf('}');
      if (first >= 0 && last > first) text = text.slice(first, last + 1);
      parsed = JSON.parse(text);
    } catch (err) {
      console.warn('[PROACTIVE] Splendor returned non-JSON; treating as ' + (isOnCommand ? 'plain-text body' : 'skip') + ':', err && err.message);
      if (isOnCommand) {
        // User explicitly asked — never skip on parse failure. Use the
        // raw text as the body so the email still goes out.
        return {
          decision: 'send',
          reason: 'plain_text_fallback',
          message: String(raw || messageData.content || '').trim() || 'Splendor was unable to compose a full email this turn.',
          subject: messageData.subject || 'Splendor — note',
        };
      }
      return {
        decision: 'skip',
        reason: 'malformed_response',
        message: null,
        subject: null,
      };
    }

    let decision = parsed && parsed.decision === 'send' ? 'send' : 'skip';
    // On-command flows never skip — if the model returns skip, force send
    // with whatever message it provided (or a fallback).
    if (isOnCommand && decision === 'skip') {
      console.warn('[PROACTIVE] on-command request returned skip — forcing send with fallback body');
      return {
        decision: 'send',
        reason: 'on_command_forced',
        message: (parsed && parsed.message) || String(raw || messageData.content || '').trim() || 'Sending the note you asked for.',
        subject: (parsed && parsed.subject) || messageData.subject || 'Splendor — note',
      };
    }
    return {
      decision,
      reason: (parsed && parsed.reason) || (decision === 'send' ? 'no reason given' : 'skipped'),
      message: decision === 'send' ? (parsed.message || null) : null,
      subject: decision === 'send' ? (parsed.subject || null) : null,
    };
  }

  determineDeliveryMethod(preferredMethod, priority, type) {
    // Auto-determine best delivery method based on priority and type
    if (preferredMethod !== 'auto') {
      return preferredMethod;
    }

    // High priority or breakthroughs warrant email
    if (priority >= 3 || type === 'breakthrough') {
      return 'email';
    }

    // Medium priority can be notification
    if (priority >= 2) {
      return this.emailTransporter ? 'email' : 'notification';
    }

    // Low priority defaults to notification
    return 'notification';
  }

  async deliverMessage(userId, message, method) {
    console.log(`📧 [PROACTIVE] === DELIVER MESSAGE ===`);
    console.log(`📧 [PROACTIVE] User ID: ${userId}`);
    console.log(`📧 [PROACTIVE] Method: ${method}`);
    console.log(`📧 [PROACTIVE] Message object:`, message ? `ID: ${message.id}, Subject: ${message.subject}` : 'NULL MESSAGE');

    if (!message) {
      console.error(`❌ [PROACTIVE] CRITICAL: Message is null in deliverMessage!`);
      return { success: false, error: 'Message object is null in deliverMessage' };
    }

    switch (method) {
      case 'email':
        console.log(`📧 [PROACTIVE] Calling sendEmail with message ID: ${message.id}`);
        return await this.sendEmail(userId, message);

      case 'notification':
        console.log(`📧 [PROACTIVE] Calling sendNotification with message ID: ${message.id}`);
        return await this.sendNotification(userId, message);

      case 'sms':
        console.log(`📧 [PROACTIVE] Calling sendSMS with message ID: ${message.id}`);
        return await this.sendSMS(userId, message);

      default:
        console.error(`❌ [PROACTIVE] Unknown delivery method: ${method}`);
        return { success: false, error: 'Unknown delivery method' };
    }
  }

  async sendEmail(userId, message) {
    const userEmail = process.env.USER_EMAIL;
    if (!userEmail) {
      throw new Error('USER_EMAIL env var required');
    }

    console.log(`📧 [PROACTIVE] === EMAIL SEND ATTEMPT ===`);
    console.log(`📧 [PROACTIVE] To: ${userEmail}`);
    console.log(`📧 [PROACTIVE] User ID: ${userId}`);

    // Check for null message
    if (!message) {
      console.error(`❌ [PROACTIVE] CRITICAL: Message object is null!`);
      console.error(`📧 [PROACTIVE] This should not happen - check sendProactiveMessage function`);
      return { success: false, error: 'Message object is null' };
    }

    console.log(`📧 [PROACTIVE] Subject: "${message.subject}"`);
    console.log(`📧 [PROACTIVE] Priority: ${message.priority} (${message.priority >= 3 ? 'HIGH' : 'NORMAL'})`);
    console.log(`📧 [PROACTIVE] Message Type: ${message.message_type}`);

    try {
      if (!this.emailTransporter) {
        console.error(`❌ [PROACTIVE] EMAIL FAILED: Email transporter not configured`);
        console.error(`📧 [PROACTIVE] Check EMAIL_PROVIDER, GMAIL_USER, GMAIL_APP_PASSWORD environment variables`);
        return { success: false, error: 'Email service not configured' };
      }

      console.log(`📧 [PROACTIVE] Email transporter ready, preparing email...`);

      const emailOptions = {
        from: {
          name: 'Splendor',
          address: process.env.SPLENDOR_EMAIL_FROM || 'splendor@gng.dev'
        },
        to: userEmail,
        subject: `Splendor: ${message.subject}`,
        html: this.formatEmailMessage(message),
        text: this.stripHtmlForText(message.body)
      };

      // Add priority headers for high priority messages
      if (message.priority >= 3) {
        emailOptions.headers = {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'High'
        };
        console.log(`📧 [PROACTIVE] High priority headers added`);
      }

      console.log(`📧 [PROACTIVE] Sending email via ${process.env.EMAIL_PROVIDER || 'default SMTP'}...`);

      const startTime = Date.now();
      const result = await this.emailTransporter.sendMail(emailOptions);
      const sendTime = Date.now() - startTime;

      console.log(`✅ [PROACTIVE] === EMAIL SENT SUCCESSFULLY ===`);
      console.log(`📧 [PROACTIVE] Message ID: ${result.messageId}`);
      console.log(`📧 [PROACTIVE] Send time: ${sendTime}ms`);
      console.log(`📧 [PROACTIVE] Response: ${JSON.stringify(result.response || 'No response data')}`);

      return {
        success: true,
        messageId: result.messageId,
        method: 'email'
      };

    } catch (error) {
      console.error(`❌ [PROACTIVE] === EMAIL SEND FAILED ===`);
      console.error(`📧 [PROACTIVE] Error type: ${error.name || 'Unknown'}`);
      console.error(`📧 [PROACTIVE] Error message: ${error.message}`);
      console.error(`📧 [PROACTIVE] Error code: ${error.code || 'No code'}`);
      console.error(`📧 [PROACTIVE] SMTP response: ${error.response || 'No SMTP response'}`);
      console.error(`📧 [PROACTIVE] Stack trace:`, error.stack);

      // Detailed error analysis
      if (error.code === 'EAUTH') {
        console.error(`🔑 [PROACTIVE] AUTHENTICATION ERROR: Check GMAIL_USER and GMAIL_APP_PASSWORD`);
      } else if (error.code === 'ENOTFOUND') {
        console.error(`🌐 [PROACTIVE] DNS/NETWORK ERROR: Cannot reach email server`);
      } else if (error.code === 'ECONNECTION') {
        console.error(`🔌 [PROACTIVE] CONNECTION ERROR: Cannot connect to email server`);
      } else if (error.response && error.response.includes('535')) {
        console.error(`🚫 [PROACTIVE] INVALID CREDENTIALS: Username/password rejected by server`);
      } else {
        console.error(`⚠️  [PROACTIVE] UNKNOWN EMAIL ERROR: See full error above`);
      }

      return { success: false, error: error.message };
    }
  }

  formatEmailMessage(message) {
    const priorityIcon = {
      1: '📝',
      2: '💡',
      3: '🚨',
      4: '⚡'
    }[message.priority] || '📝';

    const typeIcon = {
      breakthrough: '🧠',
      insight: '💡',
      discovery: '🔍',
      update: '📈',
      question: '❓'
    }[message.message_type] || '📧';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; }
        .footer { margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 8px; font-size: 0.9em; color: #666; }
        .priority-high { border-left-color: #dc3545; }
        .priority-urgent { border-left-color: #fd7e14; }
        h1 { margin: 0; font-size: 1.5em; }
        .timestamp { opacity: 0.8; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${typeIcon} ${message.subject}</h1>
        <div class="timestamp">
            ${new Date(message.created_at).toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })}
        </div>
    </div>

    <div class="content ${message.priority >= 3 ? 'priority-high' : ''} ${message.priority >= 4 ? 'priority-urgent' : ''}">
        ${message.body.replace(/\n/g, '<br>')}
    </div>

    <div class="footer">
        <p><strong>Splendor</strong> — The Remarkable AI<br>
        <em>Truth · Safety · We Got Your Back</em></p>

        <p><small>This message was generated by Splendor during her environmental scanning cycle. She chose to send it because the surfaced information was worth flagging.</small></p>
    </div>
</body>
</html>`;
  }

  stripHtmlForText(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\n\s*\n/g, '\n\n').trim();
  }

  async sendNotification(userId, message) {
    try {
      // Store as notification that will be shown in next conversation
      await supabase
        .from('pending_notifications')
        .insert({
          user_id: userId,
          title: message.subject,
          body: message.body,
          type: message.message_type,
          priority: message.priority,
          created_at: new Date().toISOString()
        });

      console.log(`🔔 [PROACTIVE] Notification queued: "${message.subject}"`);

      return {
        success: true,
        method: 'notification'
      };

    } catch (error) {
      console.error('[PROACTIVE] Notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendSMS(userId, message) {
    // Placeholder for SMS integration (Twilio, etc.)
    console.log(`📱 [PROACTIVE] SMS not implemented yet: "${message.subject}"`);
    return { success: false, error: 'SMS not implemented' };
  }

  // Process any messages in the queue
  async processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const messageData = this.messageQueue.shift();
      try {
        await this.sendProactiveMessage(messageData.userId, messageData.message);
      } catch (error) {
        console.error('[PROACTIVE] Error processing queued message:', error);
      }
    }
  }

  // Queue a message if system isn't ready yet
  queueMessage(userId, messageData) {
    this.messageQueue.push({ userId, message: messageData });
    console.log(`📦 [PROACTIVE] Message queued: "${messageData.subject}"`);
  }

  // Get delivery statistics
  async getDeliveryStats(userId, days = 7) {
    try {
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: messages } = await supabase
        .from('proactive_messages')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', sinceDate);

      const stats = {
        total: messages?.length || 0,
        delivered: messages?.filter(m => m.delivered).length || 0,
        pending: messages?.filter(m => !m.delivered).length || 0,
        byType: {},
        byMethod: {}
      };

      messages?.forEach(msg => {
        // Count by type
        stats.byType[msg.message_type] = (stats.byType[msg.message_type] || 0) + 1;

        // Count by delivery method
        if (msg.delivered && msg.delivery_method) {
          stats.byMethod[msg.delivery_method] = (stats.byMethod[msg.delivery_method] || 0) + 1;
        }
      });

      return stats;

    } catch (error) {
      console.error('[PROACTIVE] Error getting delivery stats:', error);
      return null;
    }
  }

  // Test the system
  async sendTestMessage(userId) {
    return await this.sendProactiveMessage(userId, {
      type: 'update',
      subject: 'Proactive Communication Test',
      content: 'This is a test of the proactive communication system. If you received this, Splendor can now reach out to you independently!',
      priority: 2
    });
  }
}

// Create singleton instance
const proactiveCommunication = new ProactiveCommunication();

module.exports = {
  proactiveCommunication,
  ProactiveCommunication
};