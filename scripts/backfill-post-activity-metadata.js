// Backfill post and fix activities with fixed status and reward metadata
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_API_KEY = process.env.SUPABASE_SECRET_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_API_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_API_KEY in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_API_KEY);

async function backfillMetadata() {
  console.log('🔄 Fetching post and fix activities...');
  
  // Get all post and fix activities
  const { data: activities, error: activitiesError } = await supabase
    .from('activities')
    .select('*')
    .in('type', ['post', 'fix'])
    .eq('related_table', 'posts');
  
  if (activitiesError) {
    console.error('❌ Error fetching activities:', activitiesError);
    process.exit(1);
  }
  
  console.log(`📊 Found ${activities.length} activities to update`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const activity of activities) {
    // Fetch the related post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('fixed, reward')
      .eq('id', activity.related_id)
      .single();
    
    if (postError || !post) {
      console.log(`⚠️  Skipping activity ${activity.id} - post not found`);
      skipped++;
      continue;
    }
    
    // Update the metadata to include fixed and reward
    const updatedMetadata = {
      ...activity.metadata,
      fixed: post.fixed,
      reward: post.reward,
    };
    
    const { error: updateError } = await supabase
      .from('activities')
      .update({ metadata: updatedMetadata })
      .eq('id', activity.id);
    
    if (updateError) {
      console.error(`❌ Error updating activity ${activity.id}:`, updateError);
    } else {
      updated++;
      if (updated % 10 === 0) {
        console.log(`✅ Updated ${updated} activities...`);
      }
    }
  }
  
  console.log('');
  console.log(`✅ Backfill complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
}

backfillMetadata().catch(console.error);

