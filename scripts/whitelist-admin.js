#!/usr/bin/env node

/**
 * WhatsApp Whitelist Administration Tool
 * Consolidated script for managing and monitoring the whitelist system
 */

const { Pool } = require('pg');
require('dotenv').config();

class WhitelistAdmin {
  constructor() {
    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL not configured');
      process.exit(1);
    }

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async close() {
    await this.pool.end();
  }

  /**
   * Show current whitelist statistics
   */
  async showStats(days = 7) {
    console.log(`📊 Whitelist Statistics (last ${days} days)`);
    console.log('='.repeat(50));

    const statsQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN decision = 'ALLOWED' THEN 1 END) as allowed_count,
        COUNT(CASE WHEN decision = 'BLOCKED' THEN 1 END) as blocked_count,
        ROUND(
          (COUNT(CASE WHEN decision = 'BLOCKED' THEN 1 END) * 100.0) / COUNT(*), 
          2
        ) as block_rate
      FROM whatsapp_whitelist_logs
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(statsQuery);
    const stats = result.rows[0];

    console.log(`   Total requests: ${stats.total_requests}`);
    console.log(`   Allowed: ${stats.allowed_count}`);
    console.log(`   Blocked: ${stats.blocked_count}`);
    console.log(`   Block rate: ${stats.block_rate}%`);
  }

  /**
   * Show recent whitelist activity
   */
  async showRecentActivity(limit = 10) {
    console.log(`\n🔄 Recent Activity (last ${limit} entries)`);
    console.log('='.repeat(50));

    const activityQuery = `
      SELECT phone_number, decision, reason, created_at, message_preview
      FROM whatsapp_whitelist_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const result = await this.pool.query(activityQuery);

    if (result.rows.length === 0) {
      console.log('   No recent activity found');
      return;
    }

    result.rows.forEach((row, index) => {
      const time = new Date(row.created_at).toLocaleString();
      const status = row.decision === 'ALLOWED' ? '✅' : '❌';
      
      console.log(`\n   ${index + 1}. ${status} ${row.phone_number} - ${row.decision}`);
      console.log(`      ${time}`);
      console.log(`      Reason: ${row.reason}`);
      
      if (row.message_preview) {
        const preview = row.message_preview.substring(0, 60);
        console.log(`      Message: "${preview}${row.message_preview.length > 60 ? '...' : ''}"`);
      }
    });
  }

  /**
   * Show leads with specific WhatsApp authorization status
   */
  async showLeadsByAuthorization() {
    console.log('\n👥 Leads by WhatsApp Authorization Status');
    console.log('='.repeat(50));

    const leadsQuery = `
      SELECT 
        whatsapp_authorized,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM leads 
      GROUP BY whatsapp_authorized
      ORDER BY whatsapp_authorized DESC NULLS LAST
    `;

    const result = await this.pool.query(leadsQuery);

    result.rows.forEach(row => {
      let status;
      if (row.whatsapp_authorized === true) {
        status = '✅ Authorized';
      } else if (row.whatsapp_authorized === false) {
        status = '❌ Denied';
      } else {
        status = '⚪ Not Set';
      }

      console.log(`   ${status}: ${row.count} leads (${row.percentage}%)`);
    });
  }

  /**
   * Authorize a phone number for WhatsApp
   */
  async authorizeNumber(phoneNumber, name = null) {
    console.log(`\n🔓 Authorizing number: ${phoneNumber}`);

    try {
      // Check if lead exists
      const existingLead = await this.pool.query(
        'SELECT id, name, whatsapp_authorized FROM leads WHERE phone = $1',
        [phoneNumber]
      );

      if (existingLead.rows.length > 0) {
        // Update existing lead
        const lead = existingLead.rows[0];
        await this.pool.query(
          'UPDATE leads SET whatsapp_authorized = true, updated_at = NOW() WHERE id = $1',
          [lead.id]
        );
        
        console.log(`   ✅ Updated existing lead: ${lead.name || phoneNumber}`);
      } else {
        // Create new authorized lead
        await this.pool.query(
          'INSERT INTO leads (phone, name, whatsapp_authorized, status) VALUES ($1, $2, true, $3)',
          [phoneNumber, name || `Lead ${phoneNumber}`, 'new']
        );
        
        console.log(`   ✅ Created new authorized lead: ${name || phoneNumber}`);
      }

      // Log the authorization
      await this.pool.query(`
        INSERT INTO whatsapp_whitelist_logs (phone_number, decision, reason, created_by)
        VALUES ($1, 'ALLOWED', 'Manually authorized via admin script', 'admin-script')
      `, [phoneNumber]);

    } catch (error) {
      console.error(`   ❌ Error authorizing number: ${error.message}`);
    }
  }

  /**
   * Block a phone number from WhatsApp
   */
  async blockNumber(phoneNumber, reason = 'Manually blocked') {
    console.log(`\n🚫 Blocking number: ${phoneNumber}`);

    try {
      // Update lead if exists
      const result = await this.pool.query(
        'UPDATE leads SET whatsapp_authorized = false, updated_at = NOW() WHERE phone = $1 RETURNING name',
        [phoneNumber]
      );

      if (result.rows.length > 0) {
        console.log(`   ✅ Blocked existing lead: ${result.rows[0].name || phoneNumber}`);
      } else {
        console.log(`   ⚠️ No existing lead found for ${phoneNumber}`);
      }

      // Log the blocking
      await this.pool.query(`
        INSERT INTO whatsapp_whitelist_logs (phone_number, decision, reason, created_by)
        VALUES ($1, 'BLOCKED', $2, 'admin-script')
      `, [phoneNumber, reason]);

    } catch (error) {
      console.error(`   ❌ Error blocking number: ${error.message}`);
    }
  }

  /**
   * Test whitelist logic with a sample number
   */
  async testWhitelistLogic(phoneNumber, message = 'Test message') {
    console.log(`\n🧪 Testing whitelist logic for: ${phoneNumber}`);
    console.log('='.repeat(50));

    // Simulate the whitelist check logic
    const leadResult = await this.pool.query(
      'SELECT id, name, whatsapp_authorized FROM leads WHERE phone = $1',
      [phoneNumber]
    );

    let decision = 'BLOCKED';
    let reason = 'Unknown phone number';

    if (leadResult.rows.length > 0) {
      const lead = leadResult.rows[0];
      if (lead.whatsapp_authorized === true) {
        decision = 'ALLOWED';
        reason = `Lead autorizado: ${lead.name}`;
      } else if (lead.whatsapp_authorized === false) {
        decision = 'BLOCKED';
        reason = `Lead con autorización denegada: ${lead.name}`;
      } else {
        // Check environment setting
        const allowNew = process.env.WHATSAPP_ALLOW_NEW_LEADS?.toLowerCase() === 'true';
        if (allowNew) {
          decision = 'ALLOWED';
          reason = 'Lead existente sin restricciones';
        } else {
          reason = 'Lead existente sin autorización explícita';
        }
      }
    } else {
      // Check for suspicious patterns
      const phoneNormalized = phoneNumber.toLowerCase();
      const messageNormalized = message.toLowerCase();

      if (phoneNormalized.includes('newsletter') || 
          phoneNormalized.includes('noreply') ||
          messageNormalized.includes('unsubscribe') ||
          messageNormalized.includes('automated')) {
        reason = 'Suspicious pattern detected (newsletter/bot)';
      } else {
        const allowNew = process.env.WHATSAPP_ALLOW_NEW_LEADS?.toLowerCase() === 'true';
        if (allowNew) {
          decision = 'ALLOWED';
          reason = 'New number allowed by environment setting';
        }
      }
    }

    console.log(`   Decision: ${decision}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Environment WHATSAPP_ALLOW_NEW_LEADS: ${process.env.WHATSAPP_ALLOW_NEW_LEADS || 'not set'}`);

    return decision === 'ALLOWED';
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const admin = new WhitelistAdmin();

  try {
    switch (command) {
      case 'stats':
        const days = parseInt(args[1]) || 7;
        await admin.showStats(days);
        break;

      case 'activity':
        const limit = parseInt(args[1]) || 10;
        await admin.showRecentActivity(limit);
        break;

      case 'leads':
        await admin.showLeadsByAuthorization();
        break;

      case 'authorize':
        if (!args[1]) {
          console.error('Usage: node whitelist-admin.js authorize <phone_number> [name]');
          process.exit(1);
        }
        await admin.authorizeNumber(args[1], args[2]);
        break;

      case 'block':
        if (!args[1]) {
          console.error('Usage: node whitelist-admin.js block <phone_number> [reason]');
          process.exit(1);
        }
        await admin.blockNumber(args[1], args[2]);
        break;

      case 'test':
        if (!args[1]) {
          console.error('Usage: node whitelist-admin.js test <phone_number> [message]');
          process.exit(1);
        }
        await admin.testWhitelistLogic(args[1], args[2]);
        break;

      case 'dashboard':
        await admin.showStats(7);
        await admin.showLeadsByAuthorization();
        await admin.showRecentActivity(5);
        break;

      default:
        console.log('WhatsApp Whitelist Administration Tool');
        console.log('=====================================\n');
        console.log('Usage: node whitelist-admin.js <command> [options]\n');
        console.log('Commands:');
        console.log('  stats [days]              Show whitelist statistics (default: 7 days)');
        console.log('  activity [limit]          Show recent activity (default: 10 entries)');
        console.log('  leads                     Show leads by authorization status');
        console.log('  authorize <phone> [name]  Authorize a phone number');
        console.log('  block <phone> [reason]    Block a phone number');
        console.log('  test <phone> [message]    Test whitelist logic for a number');
        console.log('  dashboard                 Show complete dashboard');
        console.log('\nExamples:');
        console.log('  node whitelist-admin.js dashboard');
        console.log('  node whitelist-admin.js authorize +1234567890 "John Doe"');
        console.log('  node whitelist-admin.js test +1234567890');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await admin.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = WhitelistAdmin;
