import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://blqddcvsvwsjempxyjiy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJscWRkY3ZzdndzamVtcHh5aml5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NDg4MTUsImV4cCI6MjEwMDMyNDgxNX0.XUaTfYNBn3WUUZEMA31OBQttvRkrE9x-utAf2gyax3A'
);

async function check() {
  const { data, error } = await supabase.from('transcripts').select('videoId, status, processing_started_at').eq('videoId', 'HO10GrtDzZU');
  console.log(data, error);
}
check();
