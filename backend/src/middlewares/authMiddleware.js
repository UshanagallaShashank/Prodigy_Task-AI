const { supabase } = require("../utils/supabase");

exports.isAdmin = async (req, res, next) => {
    try {
        const userEmail = req.user?.email; // Extract user email from request

        if (!userEmail) {
            return res.status(401).json({ error: "Unauthorized: No email provided" });
        }

        // Fetch user role from the `users` table
        const { data: user, error } = await supabase
            .from("users")
            .select("role")
            .eq("email", userEmail)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: "User not found in database" });
        }

        if (user.role !== "admin") {
            return res.status(403).json({ error: "Access denied. Admins only." });
        }

        next(); // Proceed to the next middleware or route handler
    } catch (err) {
        console.error("Middleware Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
