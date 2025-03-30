const { prisma } = require("../config/supabase"); // Import Prisma Client
const { supabase } = require("../config/supabase");
const bcrypt = require("bcrypt");

// 📌 Register User
exports.signup = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "Name, email, and password are required" });
        }

        // 🔹 Hash password before storing
        const hashedPassword = await bcrypt.hash(password, 10);

        // 🔹 Create user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            console.error("Supabase Auth Error:", error);
            return res.status(400).json({ error: error.message });
        }

        // 🔹 Store user in the database using Prisma
        await prisma.user.create({
            data: {
                id: data?.user?.id, // Supabase Auth ID
                name,
                email,
                password: hashedPassword,
                role: "USER", // Default role
            },
        });

        return res.status(201).json({ message: "User registered successfully", user: data.user });

    } catch (error) {
        console.error("Unexpected Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

// 📌 Login User
exports.signin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        // 🔹 Authenticate user with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        console.log("Token:", data.session.access_token);

        // 🔹 Extract email verification status
        const emailVerified = data?.user?.user_metadata?.email_verified || false;
        
        // 🔹 Get user details from the Prisma `User` table
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, role: true },
        });

        if (!user) {
            return res.status(400).json({ error: "User not found in database" });
        }

        return res.status(200).json({
            user: {
                ...user,
                email_verified: emailVerified,
                token: data.session.access_token, // Include JWT from Supabase
            }
        });

    } catch (error) {
        console.error("Unexpected Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
