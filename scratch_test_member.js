import { memberFacade } from './src/repositories/MemberFacade.js';
import Member from './src/models/Member.js';
import supabase from './src/services/base/SupabaseClient.js';

async function test() {
  try {
    // 1. Get gym
    const { data: gym } = await supabase.from('gyms').select('id').limit(1).single();
    if (!gym) throw new Error("No gym found");
    console.log("Using gym:", gym.id);

    const memberData = {
      gym_id: gym.id,
      full_name: 'Test QA Member ' + Date.now(),
      dni: '123456789',
      status: 'active'
    };

    const memberInstance = new Member(memberData);
    console.log("Instance:", memberInstance);

    const record = memberInstance.toDatabaseRecord();
    console.log("Record to insert:", record);

    const saved = await memberFacade.create(memberInstance);
    console.log("Success! Saved:", saved);
  } catch (err) {
    console.error("Error occurred:", err);
  }
}

test();
