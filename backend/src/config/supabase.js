const { createClient } = require("@supabase/supabase-js");

const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const prisma = new PrismaClient();

module.exports = { supabase,prisma };
