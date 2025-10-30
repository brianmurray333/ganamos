#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

// // Safety check: Don't allow running in production
// if (process.env.NODE_ENV === 'production') {
//   console.error('❌ Cannot create test user in production!')
//   console.error('   This script is for development/staging only.')
//   process.exit(1)
// }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl);
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey);
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_USER = {
  email: "test@ganamos.dev",
  password: "test123456",
  name: "Test User",
  username: "testuser",
  balance: 1000,
};

async function createTestUser() {
  console.log("🔧 Creating test user...\n");

  try {
    // First, check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === TEST_USER.email
    );

    let userId: string;

    if (existingUser) {
      console.log("✅ Test user already exists in auth");
      console.log("   User ID:", existingUser.id);
      userId = existingUser.id;
    } else {
      // Create user in Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: TEST_USER.email,
          password: TEST_USER.password,
          email_confirm: true,
          user_metadata: {
            name: TEST_USER.name,
          },
        });

      if (authError || !authData.user) {
        console.error("❌ Error creating auth user:", authError);
        process.exit(1);
      }

      userId = authData.user.id;
      console.log("✅ Created auth user");
      console.log("   User ID:", userId);
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (existingProfile) {
      console.log("✅ Profile already exists in database");
      console.log("   Username:", existingProfile.username);
      console.log("   Balance:", existingProfile.balance, "sats");
    } else {
      // Create profile in database
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: TEST_USER.email,
          name: TEST_USER.name,
          username: TEST_USER.username,
          balance: TEST_USER.balance,
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (profileError) {
        console.error("❌ Error creating profile:", profileError);
        console.log(
          "\nNote: If tables don't exist, you need to set up the database schema first."
        );
        console.log(
          "The profile will be auto-created on first login by auth-provider.tsx"
        );
        process.exit(1);
      }

      console.log("✅ Created profile in database");
      console.log("   Username:", TEST_USER.username);
      console.log("   Balance:", TEST_USER.balance, "sats");
    }

    console.log("\n✅ Test user ready!");
    console.log("\n📝 Login credentials:");
    console.log("   Email:", TEST_USER.email);
    console.log("   Password:", TEST_USER.password);
    console.log("   User ID:", userId);
    console.log("\n⚠️  Remember: This is for development only!");
    console.log("   Delete this user from production databases.");
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

createTestUser();
