const { supabase } = require("../utils/supabase");

// 📌 Register User
exports.signup = async (req, res) => {
    const { name, role, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        console.error("Supabase Auth Error:", error);
        return res.status(400).json({ error: error.message });
    }

    // Store user in the `users` table
    const { error: dbError } = await supabase.from("users").insert([
        { id: data?.user?.id || null, name, role: role || "user", email, password }
    ]);

    if (dbError) {
        console.error("Database Insert Error:", dbError);
        return res.status(400).json({ error: dbError.message || "Database error" });
    }

    res.status(201).json({ message: "User registered successfully", user: data.user });
};

// 📌 Login User
exports.signin = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    // Authenticate user with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        return res.status(401).json({ error: "Invalid email or password" });
    }
console.log(">>>>token ",data.session.access_token)
    // Extract email verification status
    const emailVerified = data?.user?.user_metadata?.email_verified || false;
console.log(emailVerified)
    // Get user details from the `users` table
    const { data: user, error: dbError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("email", email)
        .single();

    if (dbError) {
        return res.status(400).json({ error: "User not found in database" });
    }

    // Send response including email verification status
    res.status(200).json({
        user: {
            user:data.user,
            email_verified: emailVerified
        }
    });
};
