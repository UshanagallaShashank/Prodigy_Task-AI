// const { prisma } = require("../config/prisma"); // Ensure Prisma client is properly imported
const { supabase } = require("../config/supabase");

// 📌 Get All Users with Email Verification Status
exports.getAllUsers = async (req, res) => {
    try {
        console.log("Authenticated User:", req.user);

        // 🔹 Fetch all users from Prisma (PostgreSQL)
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true, // Includes role (USER / ADMIN)
                createdAt: true, // Includes account creation date
            },
        });

        if (!users || users.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        // 🔹 Fetch users from Supabase Auth (to check email verification)
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) {
            console.error("Supabase Auth Error:", authError);
            return res.status(400).json({ error: "Failed to fetch authentication data" });
        }

        // 🔹 Create a map for quick lookup of email verification status
        const emailVerifiedMap = new Map();
        authUsers.users.forEach(user => {
            emailVerifiedMap.set(user.email, user.user_metadata?.email_verified || false);
        });

        // 🔹 Merge user data with email verification status
        const updatedUsers = users.map(user => ({
            ...user,
            email_verified: emailVerifiedMap.get(user.email) || false
        }));

        return res.status(200).json({ users: updatedUsers });
    } catch (error) {
        console.error("Unexpected Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
