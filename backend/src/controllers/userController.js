const { supabase } = require("../utils/supabase");

// 📌 Get All Users with Email Verification Status
exports.getAllUsers = async (req, res) => {
    try {
        console.log("Authenticated User:", req.user);

        // Fetch users from the `users` table
        const { data: users, error: dbError } = await supabase.from("users").select("id, name, email, role");
        if (dbError) {
            console.error("Database Fetch Error:", dbError);
            return res.status(400).json({ error: dbError.message || "Failed to fetch users" });
        }

        // Fetch users from Supabase Auth to get `email_verified` status
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) {
            console.error("Auth Fetch Error:", authError);
            return res.status(400).json({ error: "Failed to fetch auth users" });
        }

        // Create a map for quick lookup of email verification status
        const emailVerifiedMap = new Map();
        authUsers.users.forEach(user => {
            emailVerifiedMap.set(user.email, user.user_metadata?.email_verified || false);
        });

        // Merge user data with email verification status
        const updatedUsers = users.map(user => ({
            ...user,
            email_verified: emailVerifiedMap.get(user.email) || false
        }));

        res.status(200).json({ users: updatedUsers });
    } catch (error) {
        console.error("Unexpected Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
