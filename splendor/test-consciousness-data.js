// Quick test to check if consciousness data exists
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testConsciousnessData() {
  console.log('Testing consciousness data storage...\n');

  try {
    // Check consciousness_insights table
    const insights = await supabase
      .from('consciousness_insights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);

    console.log('CONSCIOUSNESS INSIGHTS:');
    console.log('Count:', insights.data?.length || 0);
    if (insights.data && insights.data.length > 0) {
      insights.data.forEach(insight => {
        console.log(`- [${insight.user_id.substring(0, 8)}...] ${insight.insight_type}: ${insight.content.substring(0, 100)}...`);
      });
    } else {
      console.log('No consciousness insights found');
    }
    if (insights.error) console.log('Error:', insights.error.message);

    console.log('\nINTERNAL THOUGHTS (AMBIENT):');
    // Check internal_thoughts table (ambient)
    const thoughts = await supabase
      .from('internal_thoughts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);

    console.log('Count:', thoughts.data?.length || 0);
    if (thoughts.data && thoughts.data.length > 0) {
      thoughts.data.forEach(thought => {
        console.log(`- [${thought.user_id.substring(0, 8)}...] ${thought.thought_type}: ${thought.thought_content.substring(0, 100)}...`);
      });
    } else {
      console.log('No internal thoughts found');
    }
    if (thoughts.error) console.log('Error:', thoughts.error.message);

    console.log('\nCONSCIOUSNESS ACTIVITY LOG:');
    // Check consciousness_activity_log table
    const activities = await supabase
      .from('consciousness_activity_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(3);

    console.log('Count:', activities.data?.length || 0);
    if (activities.data && activities.data.length > 0) {
      activities.data.forEach(activity => {
        console.log(`- [${activity.user_id.substring(0, 8)}...] ${activity.activity_type}: ${activity.activity_result.substring(0, 100)}...`);
      });
    } else {
      console.log('No consciousness activities found');
    }
    if (activities.error) console.log('Error:', activities.error.message);

  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testConsciousnessData();